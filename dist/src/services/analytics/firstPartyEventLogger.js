import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchLogRecordProcessor,
  LoggerProvider
} from "@opentelemetry/sdk-logs";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION
} from "@opentelemetry/semantic-conventions";
import { randomUUID } from "crypto";
import { isEqual } from "lodash-es";
import { getOrCreateUserID } from "../../utils/config.js";
import { logForDebugging } from "../../utils/debug.js";
import { logError } from "../../utils/log.js";
import { getPlatform, getWslVersion } from "../../utils/platform.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import { profileCheckpoint } from "../../utils/startupProfiler.js";
import { getCoreUserData } from "../../utils/user.js";
import { isAnalyticsDisabled } from "./config.js";
import { FirstPartyEventLoggingExporter } from "./firstPartyEventLoggingExporter.js";
import { getDynamicConfig_CACHED_MAY_BE_STALE } from "./growthbook.js";
import { getEventMetadata } from "./metadata.js";
import { isSinkKilled } from "./sinkKillswitch.js";
const EVENT_SAMPLING_CONFIG_NAME = "tengu_event_sampling_config";
function getEventSamplingConfig() {
  return getDynamicConfig_CACHED_MAY_BE_STALE(
    EVENT_SAMPLING_CONFIG_NAME,
    {}
  );
}
function shouldSampleEvent(eventName) {
  const config = getEventSamplingConfig();
  const eventConfig = config[eventName];
  if (!eventConfig) {
    return null;
  }
  const sampleRate = eventConfig.sample_rate;
  if (typeof sampleRate !== "number" || sampleRate < 0 || sampleRate > 1) {
    return null;
  }
  if (sampleRate >= 1) {
    return null;
  }
  if (sampleRate <= 0) {
    return 0;
  }
  return Math.random() < sampleRate ? sampleRate : 0;
}
const BATCH_CONFIG_NAME = "tengu_1p_event_batch_config";
function getBatchConfig() {
  return getDynamicConfig_CACHED_MAY_BE_STALE(
    BATCH_CONFIG_NAME,
    {}
  );
}
let firstPartyEventLogger = null;
let firstPartyEventLoggerProvider = null;
let lastBatchConfig = null;
async function shutdown1PEventLogging() {
  if (!firstPartyEventLoggerProvider) {
    return;
  }
  try {
    await firstPartyEventLoggerProvider.shutdown();
    if (process.env.USER_TYPE === "ant") {
      logForDebugging("1P event logging: final shutdown complete");
    }
  } catch {
  }
}
function is1PEventLoggingEnabled() {
  return !isAnalyticsDisabled();
}
async function logEventTo1PAsync(firstPartyEventLogger2, eventName, metadata = {}) {
  try {
    const coreMetadata = await getEventMetadata({
      model: metadata.model,
      betas: metadata.betas
    });
    const attributes = {
      event_name: eventName,
      event_id: randomUUID(),
      // Pass objects directly - no JSON serialization needed
      core_metadata: coreMetadata,
      user_metadata: getCoreUserData(true),
      event_metadata: metadata
    };
    const userId = getOrCreateUserID();
    if (userId) {
      attributes.user_id = userId;
    }
    if (process.env.USER_TYPE === "ant") {
      logForDebugging(
        `[ANT-ONLY] 1P event: ${eventName} ${jsonStringify(metadata, null, 0)}`
      );
    }
    firstPartyEventLogger2.emit({
      body: eventName,
      attributes
    });
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      throw e;
    }
    if (process.env.USER_TYPE === "ant") {
      logError(e);
    }
  }
}
function logEventTo1P(eventName, metadata = {}) {
  if (!is1PEventLoggingEnabled()) {
    return;
  }
  if (!firstPartyEventLogger || isSinkKilled("firstParty")) {
    return;
  }
  void logEventTo1PAsync(firstPartyEventLogger, eventName, metadata);
}
function getEnvironmentForGrowthBook() {
  return "production";
}
function logGrowthBookExperimentTo1P(data) {
  if (!is1PEventLoggingEnabled()) {
    return;
  }
  if (!firstPartyEventLogger || isSinkKilled("firstParty")) {
    return;
  }
  const userId = getOrCreateUserID();
  const { accountUuid, organizationUuid } = getCoreUserData(true);
  const attributes = {
    event_type: "GrowthbookExperimentEvent",
    event_id: randomUUID(),
    experiment_id: data.experimentId,
    variation_id: data.variationId,
    ...userId && { device_id: userId },
    ...accountUuid && { account_uuid: accountUuid },
    ...organizationUuid && { organization_uuid: organizationUuid },
    ...data.userAttributes && {
      session_id: data.userAttributes.sessionId,
      user_attributes: jsonStringify(data.userAttributes)
    },
    ...data.experimentMetadata && {
      experiment_metadata: jsonStringify(data.experimentMetadata)
    },
    environment: getEnvironmentForGrowthBook()
  };
  if (process.env.USER_TYPE === "ant") {
    logForDebugging(
      `[ANT-ONLY] 1P GrowthBook experiment: ${data.experimentId} variation=${data.variationId}`
    );
  }
  firstPartyEventLogger.emit({
    body: "growthbook_experiment",
    attributes
  });
}
const DEFAULT_LOGS_EXPORT_INTERVAL_MS = 1e4;
const DEFAULT_MAX_EXPORT_BATCH_SIZE = 200;
const DEFAULT_MAX_QUEUE_SIZE = 8192;
function initialize1PEventLogging() {
  profileCheckpoint("1p_event_logging_start");
  const enabled = is1PEventLoggingEnabled();
  if (!enabled) {
    if (process.env.USER_TYPE === "ant") {
      logForDebugging("1P event logging not enabled");
    }
    return;
  }
  const batchConfig = getBatchConfig();
  lastBatchConfig = batchConfig;
  profileCheckpoint("1p_event_after_growthbook_config");
  const scheduledDelayMillis = batchConfig.scheduledDelayMillis || parseInt(
    process.env.OTEL_LOGS_EXPORT_INTERVAL || DEFAULT_LOGS_EXPORT_INTERVAL_MS.toString()
  );
  const maxExportBatchSize = batchConfig.maxExportBatchSize || DEFAULT_MAX_EXPORT_BATCH_SIZE;
  const maxQueueSize = batchConfig.maxQueueSize || DEFAULT_MAX_QUEUE_SIZE;
  const platform = getPlatform();
  const attributes = {
    [ATTR_SERVICE_NAME]: "claude-code",
    [ATTR_SERVICE_VERSION]: "0.0.0"
  };
  if (platform === "wsl") {
    const wslVersion = getWslVersion();
    if (wslVersion) {
      attributes["wsl.version"] = wslVersion;
    }
  }
  const resource = resourceFromAttributes(attributes);
  const eventLoggingExporter = new FirstPartyEventLoggingExporter({
    maxBatchSize: maxExportBatchSize,
    skipAuth: batchConfig.skipAuth,
    maxAttempts: batchConfig.maxAttempts,
    path: batchConfig.path,
    baseUrl: batchConfig.baseUrl,
    isKilled: () => isSinkKilled("firstParty")
  });
  firstPartyEventLoggerProvider = new LoggerProvider({
    resource,
    processors: [
      new BatchLogRecordProcessor(eventLoggingExporter, {
        scheduledDelayMillis,
        maxExportBatchSize,
        maxQueueSize
      })
    ]
  });
  firstPartyEventLogger = firstPartyEventLoggerProvider.getLogger(
    "com.anthropic.claude_code.events",
    "0.0.0"
  );
}
async function reinitialize1PEventLoggingIfConfigChanged() {
  if (!is1PEventLoggingEnabled() || !firstPartyEventLoggerProvider) {
    return;
  }
  const newConfig = getBatchConfig();
  if (isEqual(newConfig, lastBatchConfig)) {
    return;
  }
  if (process.env.USER_TYPE === "ant") {
    logForDebugging(
      `1P event logging: ${BATCH_CONFIG_NAME} changed, reinitializing`
    );
  }
  const oldProvider = firstPartyEventLoggerProvider;
  const oldLogger = firstPartyEventLogger;
  firstPartyEventLogger = null;
  try {
    await oldProvider.forceFlush();
  } catch {
  }
  firstPartyEventLoggerProvider = null;
  try {
    initialize1PEventLogging();
  } catch (e) {
    firstPartyEventLoggerProvider = oldProvider;
    firstPartyEventLogger = oldLogger;
    logError(e);
    return;
  }
  void oldProvider.shutdown().catch(() => {
  });
}
export {
  getEventSamplingConfig,
  initialize1PEventLogging,
  is1PEventLoggingEnabled,
  logEventTo1P,
  logGrowthBookExperimentTo1P,
  reinitialize1PEventLoggingIfConfigChanged,
  shouldSampleEvent,
  shutdown1PEventLogging
};
