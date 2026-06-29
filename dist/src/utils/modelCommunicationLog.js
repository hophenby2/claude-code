import { appendFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { getSessionId } from "../bootstrap/state.js";
import { redactSecrets } from "../services/teamMemorySync/secretScanner.js";
import { createBufferedWriter } from "./bufferedWriter.js";
import { registerCleanup } from "./cleanupRegistry.js";
import { getClaudeConfigHomeDir, isEnvTruthy } from "./envUtils.js";
import { jsonStringify } from "./slowOperations.js";
const EVENT_VERSION = 1;
const DEFAULT_MAX_FIELD_CHARS = 2e4;
const DEFAULT_MAX_EVENT_CHARS = 2e5;
const MAX_DEPTH = 12;
const MAX_ARRAY_ITEMS = 200;
const MAX_OBJECT_KEYS = 200;
const SENSITIVE_FIELD_RE = /^(api[_-]?key|apikey|x-api-key|authorization|auth|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|private[_-]?key|client[_-]?secret|cookie|set-cookie|bearer|credentials|session[_-]?token)$/i;
const writerByPath = /* @__PURE__ */ new Map();
function isModelCommunicationLogEnabled() {
  return isEnvTruthy(process.env.CLAUDE_CODE_LOG_MODEL_COMMUNICATION);
}
function shouldLogFullStreamDeltas() {
  return isEnvTruthy(process.env.CLAUDE_CODE_MODEL_COMMUNICATION_LOG_STREAM_DELTAS);
}
function logModelCommunicationEvent(event) {
  if (!isModelCommunicationLogEnabled()) return;
  try {
    const maxEventChars = getPositiveIntEnv(
      process.env.CLAUDE_CODE_MODEL_COMMUNICATION_LOG_MAX_EVENT_CHARS,
      DEFAULT_MAX_EVENT_CHARS
    );
    const payload = sanitizeForLog(event.payload, {
      maxFieldChars: getPositiveIntEnv(
        process.env.CLAUDE_CODE_MODEL_COMMUNICATION_LOG_MAX_FIELD_CHARS,
        DEFAULT_MAX_FIELD_CHARS
      )
    });
    const logEvent = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      sessionId: getSessionId(),
      eventVersion: EVENT_VERSION,
      direction: event.direction,
      stage: event.stage,
      source: event.source,
      ...event.requestId ? { requestId: event.requestId } : void 0,
      ...event.sequence !== void 0 ? { sequence: event.sequence } : void 0,
      ...event.model ? { model: event.model } : void 0,
      ...event.querySource !== void 0 ? {
        querySource: sanitizeForLog(event.querySource, {
          maxFieldChars: DEFAULT_MAX_FIELD_CHARS
        })
      } : void 0,
      payload
    };
    getWriter(getModelCommunicationLogPath()).write(
      fitEventToLimit(logEvent, maxEventChars)
    );
  } catch {
  }
}
function getModelCommunicationLogPath() {
  const override = process.env.CLAUDE_CODE_MODEL_COMMUNICATION_LOG_FILE;
  if (override) return override;
  return join(
    getClaudeConfigHomeDir(),
    "model-communication",
    `${getSessionId()}.jsonl`
  );
}
function getWriter(path) {
  let writer = writerByPath.get(path);
  if (!writer) {
    const bufferedWriter = createBufferedWriter({
      writeFn: (content) => {
        mkdirSync(dirname(path), { recursive: true });
        appendFileSync(path, content);
      },
      flushIntervalMs: 1e3,
      maxBufferSize: 50,
      maxBufferBytes: 256 * 1024
    });
    writer = {
      write(content) {
        bufferedWriter.write(jsonStringify(content) + "\n");
      },
      flush: bufferedWriter.flush,
      dispose: bufferedWriter.dispose
    };
    writerByPath.set(path, writer);
    registerCleanup(async () => writer?.dispose());
  }
  return writer;
}
function getPositiveIntEnv(value, defaultValue) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}
function fitEventToLimit(event, limit) {
  const serialized = safeStringify(event);
  if (serialized.length <= limit) return event;
  const previewLength = Math.min(4e3, Math.max(0, limit - 1e3));
  const preview = safeStringify(event.payload).slice(0, previewLength);
  const compact = {
    ...event,
    payload: {
      note: "payload exceeded max event size after redaction/truncation",
      originalSerializedChars: serialized.length,
      preview
    }
  };
  if (safeStringify(compact).length <= limit) return compact;
  return {
    ...event,
    payload: {
      note: "payload omitted because event exceeded max size",
      originalSerializedChars: serialized.length
    }
  };
}
function safeStringify(value) {
  try {
    return jsonStringify(value);
  } catch {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
}
function sanitizeForLog(value, options) {
  return sanitizeValue(value, options, 0, /* @__PURE__ */ new WeakSet(), void 0);
}
function sanitizeValue(value, options, depth, seen, key) {
  if (key && SENSITIVE_FIELD_RE.test(key)) return "<REDACTED:field>";
  if (depth > MAX_DEPTH) return `<TRUNCATED depth=${MAX_DEPTH}>`;
  if (typeof value === "string") return sanitizeString(value, options.maxFieldChars);
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (value === void 0) return "<undefined>";
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "function") return "<function>";
  if (value instanceof Error) {
    return {
      name: sanitizeString(value.name, options.maxFieldChars),
      message: sanitizeString(value.message, options.maxFieldChars),
      stack: value.stack ? sanitizeString(value.stack, options.maxFieldChars) : void 0
    };
  }
  if (typeof Headers !== "undefined" && value instanceof Headers) {
    const headers = {};
    for (const [headerKey, headerValue] of value.entries()) {
      headers[headerKey] = sanitizeValue(
        headerValue,
        options,
        depth + 1,
        seen,
        headerKey
      );
    }
    return headers;
  }
  if (typeof value !== "object" || value === null) return String(value);
  if (seen.has(value)) return "<CIRCULAR>";
  seen.add(value);
  if (Array.isArray(value)) {
    const result2 = value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, options, depth + 1, seen, void 0));
    if (value.length > MAX_ARRAY_ITEMS) {
      result2.push(`<TRUNCATED array_items=${value.length - MAX_ARRAY_ITEMS}>`);
    }
    seen.delete(value);
    return result2;
  }
  const result = {};
  const entries = Object.entries(value);
  for (const [entryKey, entryValue] of entries.slice(0, MAX_OBJECT_KEYS)) {
    result[entryKey] = sanitizeValue(
      entryValue,
      options,
      depth + 1,
      seen,
      entryKey
    );
  }
  if (entries.length > MAX_OBJECT_KEYS) {
    result.__truncatedKeys = entries.length - MAX_OBJECT_KEYS;
  }
  seen.delete(value);
  return result;
}
function sanitizeString(value, maxFieldChars) {
  const redacted = redactSecrets(value);
  if (redacted.length <= maxFieldChars) return redacted;
  return `${redacted.slice(0, maxFieldChars)}<TRUNCATED chars=${redacted.length}>`;
}
function _flushModelCommunicationLogWritersForTesting() {
  for (const writer of writerByPath.values()) writer.flush();
}
function _clearModelCommunicationLogWritersForTesting() {
  for (const writer of writerByPath.values()) writer.dispose();
  writerByPath.clear();
}
export {
  _clearModelCommunicationLogWritersForTesting,
  _flushModelCommunicationLogWritersForTesting,
  isModelCommunicationLogEnabled,
  logModelCommunicationEvent,
  shouldLogFullStreamDeltas
};
