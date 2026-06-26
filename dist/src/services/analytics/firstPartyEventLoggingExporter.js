import { ExportResultCode } from "@opentelemetry/core";
import axios from "axios";
import { randomUUID } from "crypto";
import { appendFile, mkdir, readdir, unlink, writeFile } from "fs/promises";
import * as path from "path";
import {
  getIsNonInteractiveSession,
  getSessionId
} from "../../bootstrap/state.js";
import { ClaudeCodeInternalEvent } from "../../types/generated/events_mono/claude_code/v1/claude_code_internal_event.js";
import { GrowthbookExperimentEvent } from "../../types/generated/events_mono/growthbook/v1/growthbook_experiment_event.js";
import {
  getClaudeAIOAuthTokens,
  hasProfileScope,
  isClaudeAISubscriber
} from "../../utils/auth.js";
import { checkHasTrustDialogAccepted } from "../../utils/config.js";
import { logForDebugging } from "../../utils/debug.js";
import { getClaudeConfigHomeDir } from "../../utils/envUtils.js";
import { errorMessage, isFsInaccessible, toError } from "../../utils/errors.js";
import { getAuthHeaders } from "../../utils/http.js";
import { readJSONLFile } from "../../utils/json.js";
import { logError } from "../../utils/log.js";
import { sleep } from "../../utils/sleep.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import { getClaudeCodeUserAgent } from "../../utils/userAgent.js";
import { isOAuthTokenExpired } from "../oauth/client.js";
import { stripProtoFields } from "./index.js";
import { to1PEventFormat } from "./metadata.js";
const BATCH_UUID = randomUUID();
const FILE_PREFIX = "1p_failed_events.";
function getStorageDir() {
  return path.join(getClaudeConfigHomeDir(), "telemetry");
}
class FirstPartyEventLoggingExporter {
  endpoint;
  timeout;
  maxBatchSize;
  skipAuth;
  batchDelayMs;
  baseBackoffDelayMs;
  maxBackoffDelayMs;
  maxAttempts;
  isKilled;
  pendingExports = [];
  isShutdown = false;
  schedule;
  cancelBackoff = null;
  attempts = 0;
  isRetrying = false;
  lastExportErrorContext;
  constructor(options = {}) {
    const baseUrl = options.baseUrl || (process.env.ANTHROPIC_BASE_URL === "https://api-staging.anthropic.com" ? "https://api-staging.anthropic.com" : "https://api.anthropic.com");
    this.endpoint = `${baseUrl}${options.path || "/api/event_logging/batch"}`;
    this.timeout = options.timeout || 1e4;
    this.maxBatchSize = options.maxBatchSize || 200;
    this.skipAuth = options.skipAuth ?? false;
    this.batchDelayMs = options.batchDelayMs || 100;
    this.baseBackoffDelayMs = options.baseBackoffDelayMs || 500;
    this.maxBackoffDelayMs = options.maxBackoffDelayMs || 3e4;
    this.maxAttempts = options.maxAttempts ?? 8;
    this.isKilled = options.isKilled ?? (() => false);
    this.schedule = options.schedule ?? ((fn, ms) => {
      const t = setTimeout(fn, ms);
      return () => clearTimeout(t);
    });
    void this.retryPreviousBatches();
  }
  // Expose for testing
  async getQueuedEventCount() {
    return (await this.loadEventsFromCurrentBatch()).length;
  }
  // --- Storage helpers ---
  getCurrentBatchFilePath() {
    return path.join(
      getStorageDir(),
      `${FILE_PREFIX}${getSessionId()}.${BATCH_UUID}.json`
    );
  }
  async loadEventsFromFile(filePath) {
    try {
      return await readJSONLFile(filePath);
    } catch {
      return [];
    }
  }
  async loadEventsFromCurrentBatch() {
    return this.loadEventsFromFile(this.getCurrentBatchFilePath());
  }
  async saveEventsToFile(filePath, events) {
    try {
      if (events.length === 0) {
        try {
          await unlink(filePath);
        } catch {
        }
      } else {
        await mkdir(getStorageDir(), { recursive: true });
        const content = events.map((e) => jsonStringify(e)).join("\n") + "\n";
        await writeFile(filePath, content, "utf8");
      }
    } catch (error) {
      logError(error);
    }
  }
  async appendEventsToFile(filePath, events) {
    if (events.length === 0) return;
    try {
      await mkdir(getStorageDir(), { recursive: true });
      const content = events.map((e) => jsonStringify(e)).join("\n") + "\n";
      await appendFile(filePath, content, "utf8");
    } catch (error) {
      logError(error);
    }
  }
  async deleteFile(filePath) {
    try {
      await unlink(filePath);
    } catch {
    }
  }
  // --- Previous batch retry (startup) ---
  async retryPreviousBatches() {
    try {
      const prefix = `${FILE_PREFIX}${getSessionId()}.`;
      let files;
      try {
        files = (await readdir(getStorageDir())).filter((f) => f.startsWith(prefix) && f.endsWith(".json")).filter((f) => !f.includes(BATCH_UUID));
      } catch (e) {
        if (isFsInaccessible(e)) return;
        throw e;
      }
      for (const file of files) {
        const filePath = path.join(getStorageDir(), file);
        void this.retryFileInBackground(filePath);
      }
    } catch (error) {
      logError(error);
    }
  }
  async retryFileInBackground(filePath) {
    if (this.attempts >= this.maxAttempts) {
      await this.deleteFile(filePath);
      return;
    }
    const events = await this.loadEventsFromFile(filePath);
    if (events.length === 0) {
      await this.deleteFile(filePath);
      return;
    }
    if (process.env.USER_TYPE === "ant") {
      logForDebugging(
        `1P event logging: retrying ${events.length} events from previous batch`
      );
    }
    const failedEvents = await this.sendEventsInBatches(events);
    if (failedEvents.length === 0) {
      await this.deleteFile(filePath);
      if (process.env.USER_TYPE === "ant") {
        logForDebugging("1P event logging: previous batch retry succeeded");
      }
    } else {
      await this.saveEventsToFile(filePath, failedEvents);
      if (process.env.USER_TYPE === "ant") {
        logForDebugging(
          `1P event logging: previous batch retry failed, ${failedEvents.length} events remain`
        );
      }
    }
  }
  async export(logs, resultCallback) {
    if (this.isShutdown) {
      if (process.env.USER_TYPE === "ant") {
        logForDebugging(
          "1P event logging export failed: Exporter has been shutdown"
        );
      }
      resultCallback({
        code: ExportResultCode.FAILED,
        error: new Error("Exporter has been shutdown")
      });
      return;
    }
    const exportPromise = this.doExport(logs, resultCallback);
    this.pendingExports.push(exportPromise);
    void exportPromise.finally(() => {
      const index = this.pendingExports.indexOf(exportPromise);
      if (index > -1) {
        void this.pendingExports.splice(index, 1);
      }
    });
  }
  async doExport(logs, resultCallback) {
    try {
      const eventLogs = logs.filter(
        (log) => log.instrumentationScope?.name === "com.anthropic.claude_code.events"
      );
      if (eventLogs.length === 0) {
        resultCallback({ code: ExportResultCode.SUCCESS });
        return;
      }
      const events = this.transformLogsToEvents(eventLogs).events;
      if (events.length === 0) {
        resultCallback({ code: ExportResultCode.SUCCESS });
        return;
      }
      if (this.attempts >= this.maxAttempts) {
        resultCallback({
          code: ExportResultCode.FAILED,
          error: new Error(
            `Dropped ${events.length} events: max attempts (${this.maxAttempts}) reached`
          )
        });
        return;
      }
      const failedEvents = await this.sendEventsInBatches(events);
      this.attempts++;
      if (failedEvents.length > 0) {
        await this.queueFailedEvents(failedEvents);
        this.scheduleBackoffRetry();
        const context = this.lastExportErrorContext ? ` (${this.lastExportErrorContext})` : "";
        resultCallback({
          code: ExportResultCode.FAILED,
          error: new Error(
            `Failed to export ${failedEvents.length} events${context}`
          )
        });
        return;
      }
      this.resetBackoff();
      if (await this.getQueuedEventCount() > 0 && !this.isRetrying) {
        void this.retryFailedEvents();
      }
      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (error) {
      if (process.env.USER_TYPE === "ant") {
        logForDebugging(
          `1P event logging export failed: ${errorMessage(error)}`
        );
      }
      logError(error);
      resultCallback({
        code: ExportResultCode.FAILED,
        error: toError(error)
      });
    }
  }
  async sendEventsInBatches(events) {
    const batches = [];
    for (let i = 0; i < events.length; i += this.maxBatchSize) {
      batches.push(events.slice(i, i + this.maxBatchSize));
    }
    if (process.env.USER_TYPE === "ant") {
      logForDebugging(
        `1P event logging: exporting ${events.length} events in ${batches.length} batch(es)`
      );
    }
    const failedBatchEvents = [];
    let lastErrorContext;
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      try {
        await this.sendBatchWithRetry({ events: batch });
      } catch (error) {
        lastErrorContext = getAxiosErrorContext(error);
        for (let j = i; j < batches.length; j++) {
          failedBatchEvents.push(...batches[j]);
        }
        if (process.env.USER_TYPE === "ant") {
          const skipped = batches.length - 1 - i;
          logForDebugging(
            `1P event logging: batch ${i + 1}/${batches.length} failed (${lastErrorContext}); short-circuiting ${skipped} remaining batch(es)`
          );
        }
        break;
      }
      if (i < batches.length - 1 && this.batchDelayMs > 0) {
        await sleep(this.batchDelayMs);
      }
    }
    if (failedBatchEvents.length > 0 && lastErrorContext) {
      this.lastExportErrorContext = lastErrorContext;
    }
    return failedBatchEvents;
  }
  async queueFailedEvents(events) {
    const filePath = this.getCurrentBatchFilePath();
    await this.appendEventsToFile(filePath, events);
    const context = this.lastExportErrorContext ? ` (${this.lastExportErrorContext})` : "";
    const message = `1P event logging: ${events.length} events failed to export${context}`;
    logError(new Error(message));
  }
  scheduleBackoffRetry() {
    if (this.cancelBackoff || this.isRetrying || this.isShutdown) {
      return;
    }
    const delay = Math.min(
      this.baseBackoffDelayMs * this.attempts * this.attempts,
      this.maxBackoffDelayMs
    );
    if (process.env.USER_TYPE === "ant") {
      logForDebugging(
        `1P event logging: scheduling backoff retry in ${delay}ms (attempt ${this.attempts})`
      );
    }
    this.cancelBackoff = this.schedule(async () => {
      this.cancelBackoff = null;
      await this.retryFailedEvents();
    }, delay);
  }
  async retryFailedEvents() {
    const filePath = this.getCurrentBatchFilePath();
    while (!this.isShutdown) {
      const events = await this.loadEventsFromFile(filePath);
      if (events.length === 0) break;
      if (this.attempts >= this.maxAttempts) {
        if (process.env.USER_TYPE === "ant") {
          logForDebugging(
            `1P event logging: max attempts (${this.maxAttempts}) reached, dropping ${events.length} events`
          );
        }
        await this.deleteFile(filePath);
        this.resetBackoff();
        return;
      }
      this.isRetrying = true;
      await this.deleteFile(filePath);
      if (process.env.USER_TYPE === "ant") {
        logForDebugging(
          `1P event logging: retrying ${events.length} failed events (attempt ${this.attempts + 1})`
        );
      }
      const failedEvents = await this.sendEventsInBatches(events);
      this.attempts++;
      this.isRetrying = false;
      if (failedEvents.length > 0) {
        await this.saveEventsToFile(filePath, failedEvents);
        this.scheduleBackoffRetry();
        return;
      }
      this.resetBackoff();
      if (process.env.USER_TYPE === "ant") {
        logForDebugging("1P event logging: backoff retry succeeded");
      }
    }
  }
  resetBackoff() {
    this.attempts = 0;
    if (this.cancelBackoff) {
      this.cancelBackoff();
      this.cancelBackoff = null;
    }
  }
  async sendBatchWithRetry(payload) {
    if (this.isKilled()) {
      throw new Error("firstParty sink killswitch active");
    }
    const baseHeaders = {
      "Content-Type": "application/json",
      "User-Agent": getClaudeCodeUserAgent(),
      "x-service-name": "claude-code"
    };
    const hasTrust = checkHasTrustDialogAccepted() || getIsNonInteractiveSession();
    if (process.env.USER_TYPE === "ant" && !hasTrust) {
      logForDebugging("1P event logging: Trust not accepted");
    }
    let shouldSkipAuth = this.skipAuth || !hasTrust;
    if (!shouldSkipAuth && isClaudeAISubscriber()) {
      const tokens = getClaudeAIOAuthTokens();
      if (!hasProfileScope()) {
        shouldSkipAuth = true;
      } else if (tokens && isOAuthTokenExpired(tokens.expiresAt)) {
        shouldSkipAuth = true;
        if (process.env.USER_TYPE === "ant") {
          logForDebugging(
            "1P event logging: OAuth token expired, skipping auth to avoid 401"
          );
        }
      }
    }
    const authResult = shouldSkipAuth ? { headers: {}, error: "trust not established or Oauth token expired" } : getAuthHeaders();
    const useAuth = !authResult.error;
    if (!useAuth && process.env.USER_TYPE === "ant") {
      logForDebugging(
        `1P event logging: auth not available, sending without auth`
      );
    }
    const headers = useAuth ? { ...baseHeaders, ...authResult.headers } : baseHeaders;
    try {
      const response = await axios.post(this.endpoint, payload, {
        timeout: this.timeout,
        headers
      });
      this.logSuccess(payload.events.length, useAuth, response.data);
      return;
    } catch (error) {
      if (useAuth && axios.isAxiosError(error) && error.response?.status === 401) {
        if (process.env.USER_TYPE === "ant") {
          logForDebugging(
            "1P event logging: 401 auth error, retrying without auth"
          );
        }
        const response = await axios.post(this.endpoint, payload, {
          timeout: this.timeout,
          headers: baseHeaders
        });
        this.logSuccess(payload.events.length, false, response.data);
        return;
      }
      throw error;
    }
  }
  logSuccess(eventCount, withAuth, responseData) {
    if (process.env.USER_TYPE === "ant") {
      logForDebugging(
        `1P event logging: ${eventCount} events exported successfully${withAuth ? " (with auth)" : " (without auth)"}`
      );
      logForDebugging(`API Response: ${jsonStringify(responseData, null, 2)}`);
    }
  }
  hrTimeToDate(hrTime) {
    const [seconds, nanoseconds] = hrTime;
    return new Date(seconds * 1e3 + nanoseconds / 1e6);
  }
  transformLogsToEvents(logs) {
    const events = [];
    for (const log of logs) {
      const attributes = log.attributes || {};
      if (attributes.event_type === "GrowthbookExperimentEvent") {
        const timestamp = this.hrTimeToDate(log.hrTime);
        const account_uuid = attributes.account_uuid;
        const organization_uuid = attributes.organization_uuid;
        events.push({
          event_type: "GrowthbookExperimentEvent",
          event_data: GrowthbookExperimentEvent.toJSON({
            event_id: attributes.event_id,
            timestamp,
            experiment_id: attributes.experiment_id,
            variation_id: attributes.variation_id,
            environment: attributes.environment,
            user_attributes: attributes.user_attributes,
            experiment_metadata: attributes.experiment_metadata,
            device_id: attributes.device_id,
            session_id: attributes.session_id,
            auth: account_uuid || organization_uuid ? { account_uuid, organization_uuid } : void 0
          })
        });
        continue;
      }
      const eventName = attributes.event_name || log.body || "unknown";
      const coreMetadata = attributes.core_metadata;
      const userMetadata = attributes.user_metadata;
      const eventMetadata = attributes.event_metadata || {};
      if (!coreMetadata) {
        if (process.env.USER_TYPE === "ant") {
          logForDebugging(
            `1P event logging: core_metadata missing for event ${eventName}`
          );
        }
        events.push({
          event_type: "ClaudeCodeInternalEvent",
          event_data: ClaudeCodeInternalEvent.toJSON({
            event_id: attributes.event_id,
            event_name: eventName,
            client_timestamp: this.hrTimeToDate(log.hrTime),
            session_id: getSessionId(),
            additional_metadata: Buffer.from(
              jsonStringify({
                transform_error: "core_metadata attribute is missing"
              })
            ).toString("base64")
          })
        });
        continue;
      }
      const formatted = to1PEventFormat(
        coreMetadata,
        userMetadata,
        eventMetadata
      );
      const {
        _PROTO_skill_name,
        _PROTO_plugin_name,
        _PROTO_marketplace_name,
        ...rest
      } = formatted.additional;
      const additionalMetadata = stripProtoFields(rest);
      events.push({
        event_type: "ClaudeCodeInternalEvent",
        event_data: ClaudeCodeInternalEvent.toJSON({
          event_id: attributes.event_id,
          event_name: eventName,
          client_timestamp: this.hrTimeToDate(log.hrTime),
          device_id: attributes.user_id,
          email: userMetadata?.email,
          auth: formatted.auth,
          ...formatted.core,
          env: formatted.env,
          process: formatted.process,
          skill_name: typeof _PROTO_skill_name === "string" ? _PROTO_skill_name : void 0,
          plugin_name: typeof _PROTO_plugin_name === "string" ? _PROTO_plugin_name : void 0,
          marketplace_name: typeof _PROTO_marketplace_name === "string" ? _PROTO_marketplace_name : void 0,
          additional_metadata: Object.keys(additionalMetadata).length > 0 ? Buffer.from(jsonStringify(additionalMetadata)).toString(
            "base64"
          ) : void 0
        })
      });
    }
    return { events };
  }
  async shutdown() {
    this.isShutdown = true;
    this.resetBackoff();
    await this.forceFlush();
    if (process.env.USER_TYPE === "ant") {
      logForDebugging("1P event logging exporter shutdown complete");
    }
  }
  async forceFlush() {
    await Promise.all(this.pendingExports);
    if (process.env.USER_TYPE === "ant") {
      logForDebugging("1P event logging exporter flush complete");
    }
  }
}
function getAxiosErrorContext(error) {
  if (!axios.isAxiosError(error)) {
    return errorMessage(error);
  }
  const parts = [];
  const requestId = error.response?.headers?.["request-id"];
  if (requestId) {
    parts.push(`request-id=${requestId}`);
  }
  if (error.response?.status) {
    parts.push(`status=${error.response.status}`);
  }
  if (error.code) {
    parts.push(`code=${error.code}`);
  }
  if (error.message) {
    parts.push(error.message);
  }
  return parts.join(", ");
}
export {
  FirstPartyEventLoggingExporter
};
