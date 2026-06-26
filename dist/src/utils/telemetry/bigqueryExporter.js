import { ExportResultCode } from "@opentelemetry/core";
import {
  AggregationTemporality
} from "@opentelemetry/sdk-metrics";
import axios from "axios";
import { checkMetricsEnabled } from "../../services/api/metricsOptOut.js";
import { getIsNonInteractiveSession } from "../../bootstrap/state.js";
import { getSubscriptionType, isClaudeAISubscriber } from "../auth.js";
import { checkHasTrustDialogAccepted } from "../config.js";
import { logForDebugging } from "../debug.js";
import { errorMessage, toError } from "../errors.js";
import { getAuthHeaders } from "../http.js";
import { logError } from "../log.js";
import { jsonStringify } from "../slowOperations.js";
import { getClaudeCodeUserAgent } from "../userAgent.js";
class BigQueryMetricsExporter {
  endpoint;
  timeout;
  pendingExports = [];
  isShutdown = false;
  constructor(options = {}) {
    const defaultEndpoint = "https://api.anthropic.com/api/claude_code/metrics";
    if (process.env.USER_TYPE === "ant" && process.env.ANT_CLAUDE_CODE_METRICS_ENDPOINT) {
      this.endpoint = process.env.ANT_CLAUDE_CODE_METRICS_ENDPOINT + "/api/claude_code/metrics";
    } else {
      this.endpoint = defaultEndpoint;
    }
    this.timeout = options.timeout || 5e3;
  }
  async export(metrics, resultCallback) {
    if (this.isShutdown) {
      resultCallback({
        code: ExportResultCode.FAILED,
        error: new Error("Exporter has been shutdown")
      });
      return;
    }
    const exportPromise = this.doExport(metrics, resultCallback);
    this.pendingExports.push(exportPromise);
    void exportPromise.finally(() => {
      const index = this.pendingExports.indexOf(exportPromise);
      if (index > -1) {
        void this.pendingExports.splice(index, 1);
      }
    });
  }
  async doExport(metrics, resultCallback) {
    try {
      const hasTrust = checkHasTrustDialogAccepted() || getIsNonInteractiveSession();
      if (!hasTrust) {
        logForDebugging(
          "BigQuery metrics export: trust not established, skipping"
        );
        resultCallback({ code: ExportResultCode.SUCCESS });
        return;
      }
      const metricsStatus = await checkMetricsEnabled();
      if (!metricsStatus.enabled) {
        logForDebugging("Metrics export disabled by organization setting");
        resultCallback({ code: ExportResultCode.SUCCESS });
        return;
      }
      const payload = this.transformMetricsForInternal(metrics);
      const authResult = getAuthHeaders();
      if (authResult.error) {
        logForDebugging(`Metrics export failed: ${authResult.error}`);
        resultCallback({
          code: ExportResultCode.FAILED,
          error: new Error(authResult.error)
        });
        return;
      }
      const headers = {
        "Content-Type": "application/json",
        "User-Agent": getClaudeCodeUserAgent(),
        ...authResult.headers
      };
      const response = await axios.post(this.endpoint, payload, {
        timeout: this.timeout,
        headers
      });
      logForDebugging("BigQuery metrics exported successfully");
      logForDebugging(
        `BigQuery API Response: ${jsonStringify(response.data, null, 2)}`
      );
      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (error) {
      logForDebugging(`BigQuery metrics export failed: ${errorMessage(error)}`);
      logError(error);
      resultCallback({
        code: ExportResultCode.FAILED,
        error: toError(error)
      });
    }
  }
  transformMetricsForInternal(metrics) {
    const attrs = metrics.resource.attributes;
    const resourceAttributes = {
      "service.name": attrs["service.name"] || "claude-code",
      "service.version": attrs["service.version"] || "unknown",
      "os.type": attrs["os.type"] || "unknown",
      "os.version": attrs["os.version"] || "unknown",
      "host.arch": attrs["host.arch"] || "unknown",
      "aggregation.temporality": this.selectAggregationTemporality() === AggregationTemporality.DELTA ? "delta" : "cumulative"
    };
    if (attrs["wsl.version"]) {
      resourceAttributes["wsl.version"] = attrs["wsl.version"];
    }
    if (isClaudeAISubscriber()) {
      resourceAttributes["user.customer_type"] = "claude_ai";
      const subscriptionType = getSubscriptionType();
      if (subscriptionType) {
        resourceAttributes["user.subscription_type"] = subscriptionType;
      }
    } else {
      resourceAttributes["user.customer_type"] = "api";
    }
    const transformed = {
      resource_attributes: resourceAttributes,
      metrics: metrics.scopeMetrics.flatMap(
        (scopeMetric) => scopeMetric.metrics.map((metric) => ({
          name: metric.descriptor.name,
          description: metric.descriptor.description,
          unit: metric.descriptor.unit,
          data_points: this.extractDataPoints(metric)
        }))
      )
    };
    return transformed;
  }
  extractDataPoints(metric) {
    const dataPoints = metric.dataPoints || [];
    return dataPoints.filter(
      (point) => typeof point.value === "number"
    ).map((point) => ({
      attributes: this.convertAttributes(point.attributes),
      value: point.value,
      timestamp: this.hrTimeToISOString(
        point.endTime || point.startTime || [Date.now() / 1e3, 0]
      )
    }));
  }
  async shutdown() {
    this.isShutdown = true;
    await this.forceFlush();
    logForDebugging("BigQuery metrics exporter shutdown complete");
  }
  async forceFlush() {
    await Promise.all(this.pendingExports);
    logForDebugging("BigQuery metrics exporter flush complete");
  }
  convertAttributes(attributes) {
    const result = {};
    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        if (value !== void 0 && value !== null) {
          result[key] = String(value);
        }
      }
    }
    return result;
  }
  hrTimeToISOString(hrTime) {
    const [seconds, nanoseconds] = hrTime;
    const date = new Date(seconds * 1e3 + nanoseconds / 1e6);
    return date.toISOString();
  }
  selectAggregationTemporality() {
    return AggregationTemporality.DELTA;
  }
}
export {
  BigQueryMetricsExporter
};
