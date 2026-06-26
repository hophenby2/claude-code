const feature = (_name) => false;
import { context as otelContext, trace } from "@opentelemetry/api";
import { AsyncLocalStorage } from "async_hooks";
import "../../services/analytics/growthbook.js";
import { isEnvTruthy } from "../envUtils.js";
import { getTelemetryAttributes } from "../telemetryAttributes.js";
import {
  addBetaInteractionAttributes,
  addBetaLLMRequestAttributes,
  addBetaLLMResponseAttributes,
  addBetaToolInputAttributes,
  addBetaToolResultAttributes,
  isBetaTracingEnabled,
  truncateContent
} from "./betaSessionTracing.js";
import {
  endInteractionPerfettoSpan,
  endLLMRequestPerfettoSpan,
  endToolPerfettoSpan,
  endUserInputPerfettoSpan,
  isPerfettoTracingEnabled,
  startInteractionPerfettoSpan,
  startLLMRequestPerfettoSpan,
  startToolPerfettoSpan,
  startUserInputPerfettoSpan
} from "./perfettoTracing.js";
const interactionContext = new AsyncLocalStorage();
const toolContext = new AsyncLocalStorage();
const activeSpans = /* @__PURE__ */ new Map();
const strongSpans = /* @__PURE__ */ new Map();
let interactionSequence = 0;
let _cleanupIntervalStarted = false;
const SPAN_TTL_MS = 30 * 60 * 1e3;
function getSpanId(span) {
  return span.spanContext().spanId || "";
}
function ensureCleanupInterval() {
  if (_cleanupIntervalStarted) return;
  _cleanupIntervalStarted = true;
  const interval = setInterval(() => {
    const cutoff = Date.now() - SPAN_TTL_MS;
    for (const [spanId, weakRef] of activeSpans) {
      const ctx = weakRef.deref();
      if (ctx === void 0) {
        activeSpans.delete(spanId);
        strongSpans.delete(spanId);
      } else if (ctx.startTime < cutoff) {
        if (!ctx.ended) ctx.span.end();
        activeSpans.delete(spanId);
        strongSpans.delete(spanId);
      }
    }
  }, 6e4);
  if (typeof interval.unref === "function") {
    interval.unref();
  }
}
function isEnhancedTelemetryEnabled() {
  if (false) {
    const env = process.env.CLAUDE_CODE_ENHANCED_TELEMETRY_BETA ?? process.env.ENABLE_ENHANCED_TELEMETRY_BETA;
    if (isEnvTruthy(env)) {
      return true;
    }
    if (isEnvDefinedFalsy(env)) {
      return false;
    }
    return process.env.USER_TYPE === "ant" || getFeatureValue_CACHED_MAY_BE_STALE("enhanced_telemetry_beta", false);
  }
  return false;
}
function isAnyTracingEnabled() {
  return isEnhancedTelemetryEnabled() || isBetaTracingEnabled();
}
function getTracer() {
  return trace.getTracer("com.anthropic.claude_code.tracing", "1.0.0");
}
function createSpanAttributes(spanType, customAttributes = {}) {
  const baseAttributes = getTelemetryAttributes();
  const attributes = {
    ...baseAttributes,
    "span.type": spanType,
    ...customAttributes
  };
  return attributes;
}
function startInteractionSpan(userPrompt) {
  ensureCleanupInterval();
  const perfettoSpanId = isPerfettoTracingEnabled() ? startInteractionPerfettoSpan(userPrompt) : void 0;
  if (!isAnyTracingEnabled()) {
    if (perfettoSpanId) {
      const dummySpan = trace.getActiveSpan() || getTracer().startSpan("dummy");
      const spanId2 = getSpanId(dummySpan);
      const spanContextObj2 = {
        span: dummySpan,
        startTime: Date.now(),
        attributes: {},
        perfettoSpanId
      };
      activeSpans.set(spanId2, new WeakRef(spanContextObj2));
      interactionContext.enterWith(spanContextObj2);
      return dummySpan;
    }
    return trace.getActiveSpan() || getTracer().startSpan("dummy");
  }
  const tracer = getTracer();
  const isUserPromptLoggingEnabled = isEnvTruthy(
    process.env.OTEL_LOG_USER_PROMPTS
  );
  const promptToLog = isUserPromptLoggingEnabled ? userPrompt : "<REDACTED>";
  interactionSequence++;
  const attributes = createSpanAttributes("interaction", {
    user_prompt: promptToLog,
    user_prompt_length: userPrompt.length,
    "interaction.sequence": interactionSequence
  });
  const span = tracer.startSpan("claude_code.interaction", {
    attributes
  });
  addBetaInteractionAttributes(span, userPrompt);
  const spanId = getSpanId(span);
  const spanContextObj = {
    span,
    startTime: Date.now(),
    attributes,
    perfettoSpanId
  };
  activeSpans.set(spanId, new WeakRef(spanContextObj));
  interactionContext.enterWith(spanContextObj);
  return span;
}
function endInteractionSpan() {
  const spanContext = interactionContext.getStore();
  if (!spanContext) {
    return;
  }
  if (spanContext.ended) {
    return;
  }
  if (spanContext.perfettoSpanId) {
    endInteractionPerfettoSpan(spanContext.perfettoSpanId);
  }
  if (!isAnyTracingEnabled()) {
    spanContext.ended = true;
    activeSpans.delete(getSpanId(spanContext.span));
    interactionContext.enterWith(void 0);
    return;
  }
  const duration = Date.now() - spanContext.startTime;
  spanContext.span.setAttributes({
    "interaction.duration_ms": duration
  });
  spanContext.span.end();
  spanContext.ended = true;
  activeSpans.delete(getSpanId(spanContext.span));
  interactionContext.enterWith(void 0);
}
function startLLMRequestSpan(model, newContext, messagesForAPI, fastMode) {
  const perfettoSpanId = isPerfettoTracingEnabled() ? startLLMRequestPerfettoSpan({
    model,
    querySource: newContext?.querySource,
    messageId: void 0
    // Will be set in endLLMRequestSpan
  }) : void 0;
  if (!isAnyTracingEnabled()) {
    if (perfettoSpanId) {
      const dummySpan = trace.getActiveSpan() || getTracer().startSpan("dummy");
      const spanId2 = getSpanId(dummySpan);
      const spanContextObj2 = {
        span: dummySpan,
        startTime: Date.now(),
        attributes: { model },
        perfettoSpanId
      };
      activeSpans.set(spanId2, new WeakRef(spanContextObj2));
      strongSpans.set(spanId2, spanContextObj2);
      return dummySpan;
    }
    return trace.getActiveSpan() || getTracer().startSpan("dummy");
  }
  const tracer = getTracer();
  const parentSpanCtx = interactionContext.getStore();
  const attributes = createSpanAttributes("llm_request", {
    model,
    "llm_request.context": parentSpanCtx ? "interaction" : "standalone",
    speed: fastMode ? "fast" : "normal"
  });
  const ctx = parentSpanCtx ? trace.setSpan(otelContext.active(), parentSpanCtx.span) : otelContext.active();
  const span = tracer.startSpan("claude_code.llm_request", { attributes }, ctx);
  if (newContext?.querySource) {
    span.setAttribute("query_source", newContext.querySource);
  }
  addBetaLLMRequestAttributes(span, newContext, messagesForAPI);
  const spanId = getSpanId(span);
  const spanContextObj = {
    span,
    startTime: Date.now(),
    attributes,
    perfettoSpanId
  };
  activeSpans.set(spanId, new WeakRef(spanContextObj));
  strongSpans.set(spanId, spanContextObj);
  return span;
}
function endLLMRequestSpan(span, metadata) {
  let llmSpanContext;
  if (span) {
    const spanId2 = getSpanId(span);
    llmSpanContext = activeSpans.get(spanId2)?.deref();
  } else {
    llmSpanContext = Array.from(activeSpans.values()).findLast((r) => {
      const ctx = r.deref();
      return ctx?.attributes["span.type"] === "llm_request" || ctx?.attributes["model"];
    })?.deref();
  }
  if (!llmSpanContext) {
    return;
  }
  const duration = Date.now() - llmSpanContext.startTime;
  if (llmSpanContext.perfettoSpanId) {
    endLLMRequestPerfettoSpan(llmSpanContext.perfettoSpanId, {
      ttftMs: metadata?.ttftMs,
      ttltMs: duration,
      // Time to last token is the total duration
      promptTokens: metadata?.inputTokens,
      outputTokens: metadata?.outputTokens,
      cacheReadTokens: metadata?.cacheReadTokens,
      cacheCreationTokens: metadata?.cacheCreationTokens,
      success: metadata?.success,
      error: metadata?.error,
      requestSetupMs: metadata?.requestSetupMs,
      attemptStartTimes: metadata?.attemptStartTimes
    });
  }
  if (!isAnyTracingEnabled()) {
    const spanId2 = getSpanId(llmSpanContext.span);
    activeSpans.delete(spanId2);
    strongSpans.delete(spanId2);
    return;
  }
  const endAttributes = {
    duration_ms: duration
  };
  if (metadata) {
    if (metadata.inputTokens !== void 0)
      endAttributes["input_tokens"] = metadata.inputTokens;
    if (metadata.outputTokens !== void 0)
      endAttributes["output_tokens"] = metadata.outputTokens;
    if (metadata.cacheReadTokens !== void 0)
      endAttributes["cache_read_tokens"] = metadata.cacheReadTokens;
    if (metadata.cacheCreationTokens !== void 0)
      endAttributes["cache_creation_tokens"] = metadata.cacheCreationTokens;
    if (metadata.success !== void 0)
      endAttributes["success"] = metadata.success;
    if (metadata.statusCode !== void 0)
      endAttributes["status_code"] = metadata.statusCode;
    if (metadata.error !== void 0) endAttributes["error"] = metadata.error;
    if (metadata.attempt !== void 0)
      endAttributes["attempt"] = metadata.attempt;
    if (metadata.hasToolCall !== void 0)
      endAttributes["response.has_tool_call"] = metadata.hasToolCall;
    if (metadata.ttftMs !== void 0)
      endAttributes["ttft_ms"] = metadata.ttftMs;
    addBetaLLMResponseAttributes(endAttributes, metadata);
  }
  llmSpanContext.span.setAttributes(endAttributes);
  llmSpanContext.span.end();
  const spanId = getSpanId(llmSpanContext.span);
  activeSpans.delete(spanId);
  strongSpans.delete(spanId);
}
function startToolSpan(toolName, toolAttributes, toolInput) {
  const perfettoSpanId = isPerfettoTracingEnabled() ? startToolPerfettoSpan(toolName, toolAttributes) : void 0;
  if (!isAnyTracingEnabled()) {
    if (perfettoSpanId) {
      const dummySpan = trace.getActiveSpan() || getTracer().startSpan("dummy");
      const spanId2 = getSpanId(dummySpan);
      const spanContextObj2 = {
        span: dummySpan,
        startTime: Date.now(),
        attributes: { "span.type": "tool", tool_name: toolName },
        perfettoSpanId
      };
      activeSpans.set(spanId2, new WeakRef(spanContextObj2));
      toolContext.enterWith(spanContextObj2);
      return dummySpan;
    }
    return trace.getActiveSpan() || getTracer().startSpan("dummy");
  }
  const tracer = getTracer();
  const parentSpanCtx = interactionContext.getStore();
  const attributes = createSpanAttributes("tool", {
    tool_name: toolName,
    ...toolAttributes
  });
  const ctx = parentSpanCtx ? trace.setSpan(otelContext.active(), parentSpanCtx.span) : otelContext.active();
  const span = tracer.startSpan("claude_code.tool", { attributes }, ctx);
  if (toolInput) {
    addBetaToolInputAttributes(span, toolName, toolInput);
  }
  const spanId = getSpanId(span);
  const spanContextObj = {
    span,
    startTime: Date.now(),
    attributes,
    perfettoSpanId
  };
  activeSpans.set(spanId, new WeakRef(spanContextObj));
  toolContext.enterWith(spanContextObj);
  return span;
}
function startToolBlockedOnUserSpan() {
  const perfettoSpanId = isPerfettoTracingEnabled() ? startUserInputPerfettoSpan("tool_permission") : void 0;
  if (!isAnyTracingEnabled()) {
    if (perfettoSpanId) {
      const dummySpan = trace.getActiveSpan() || getTracer().startSpan("dummy");
      const spanId2 = getSpanId(dummySpan);
      const spanContextObj2 = {
        span: dummySpan,
        startTime: Date.now(),
        attributes: { "span.type": "tool.blocked_on_user" },
        perfettoSpanId
      };
      activeSpans.set(spanId2, new WeakRef(spanContextObj2));
      strongSpans.set(spanId2, spanContextObj2);
      return dummySpan;
    }
    return trace.getActiveSpan() || getTracer().startSpan("dummy");
  }
  const tracer = getTracer();
  const parentSpanCtx = toolContext.getStore();
  const attributes = createSpanAttributes("tool.blocked_on_user");
  const ctx = parentSpanCtx ? trace.setSpan(otelContext.active(), parentSpanCtx.span) : otelContext.active();
  const span = tracer.startSpan(
    "claude_code.tool.blocked_on_user",
    { attributes },
    ctx
  );
  const spanId = getSpanId(span);
  const spanContextObj = {
    span,
    startTime: Date.now(),
    attributes,
    perfettoSpanId
  };
  activeSpans.set(spanId, new WeakRef(spanContextObj));
  strongSpans.set(spanId, spanContextObj);
  return span;
}
function endToolBlockedOnUserSpan(decision, source) {
  const blockedSpanContext = Array.from(activeSpans.values()).findLast(
    (r) => r.deref()?.attributes["span.type"] === "tool.blocked_on_user"
  )?.deref();
  if (!blockedSpanContext) {
    return;
  }
  if (blockedSpanContext.perfettoSpanId) {
    endUserInputPerfettoSpan(blockedSpanContext.perfettoSpanId, {
      decision,
      source
    });
  }
  if (!isAnyTracingEnabled()) {
    const spanId2 = getSpanId(blockedSpanContext.span);
    activeSpans.delete(spanId2);
    strongSpans.delete(spanId2);
    return;
  }
  const duration = Date.now() - blockedSpanContext.startTime;
  const attributes = {
    duration_ms: duration
  };
  if (decision) {
    attributes["decision"] = decision;
  }
  if (source) {
    attributes["source"] = source;
  }
  blockedSpanContext.span.setAttributes(attributes);
  blockedSpanContext.span.end();
  const spanId = getSpanId(blockedSpanContext.span);
  activeSpans.delete(spanId);
  strongSpans.delete(spanId);
}
function startToolExecutionSpan() {
  if (!isAnyTracingEnabled()) {
    return trace.getActiveSpan() || getTracer().startSpan("dummy");
  }
  const tracer = getTracer();
  const parentSpanCtx = toolContext.getStore();
  const attributes = createSpanAttributes("tool.execution");
  const ctx = parentSpanCtx ? trace.setSpan(otelContext.active(), parentSpanCtx.span) : otelContext.active();
  const span = tracer.startSpan(
    "claude_code.tool.execution",
    { attributes },
    ctx
  );
  const spanId = getSpanId(span);
  const spanContextObj = {
    span,
    startTime: Date.now(),
    attributes
  };
  activeSpans.set(spanId, new WeakRef(spanContextObj));
  strongSpans.set(spanId, spanContextObj);
  return span;
}
function endToolExecutionSpan(metadata) {
  if (!isAnyTracingEnabled()) {
    return;
  }
  const executionSpanContext = Array.from(activeSpans.values()).findLast((r) => r.deref()?.attributes["span.type"] === "tool.execution")?.deref();
  if (!executionSpanContext) {
    return;
  }
  const duration = Date.now() - executionSpanContext.startTime;
  const attributes = {
    duration_ms: duration
  };
  if (metadata) {
    if (metadata.success !== void 0) attributes["success"] = metadata.success;
    if (metadata.error !== void 0) attributes["error"] = metadata.error;
  }
  executionSpanContext.span.setAttributes(attributes);
  executionSpanContext.span.end();
  const spanId = getSpanId(executionSpanContext.span);
  activeSpans.delete(spanId);
  strongSpans.delete(spanId);
}
function endToolSpan(toolResult, resultTokens) {
  const toolSpanContext = toolContext.getStore();
  if (!toolSpanContext) {
    return;
  }
  if (toolSpanContext.perfettoSpanId) {
    endToolPerfettoSpan(toolSpanContext.perfettoSpanId, {
      success: true,
      resultTokens
    });
  }
  if (!isAnyTracingEnabled()) {
    const spanId2 = getSpanId(toolSpanContext.span);
    activeSpans.delete(spanId2);
    toolContext.enterWith(void 0);
    return;
  }
  const duration = Date.now() - toolSpanContext.startTime;
  const endAttributes = {
    duration_ms: duration
  };
  if (toolResult) {
    const toolName = toolSpanContext.attributes["tool_name"] || "unknown";
    addBetaToolResultAttributes(endAttributes, toolName, toolResult);
  }
  if (resultTokens !== void 0) {
    endAttributes["result_tokens"] = resultTokens;
  }
  toolSpanContext.span.setAttributes(endAttributes);
  toolSpanContext.span.end();
  const spanId = getSpanId(toolSpanContext.span);
  activeSpans.delete(spanId);
  toolContext.enterWith(void 0);
}
function isToolContentLoggingEnabled() {
  return isEnvTruthy(process.env.OTEL_LOG_TOOL_CONTENT);
}
function addToolContentEvent(eventName, attributes) {
  if (!isAnyTracingEnabled() || !isToolContentLoggingEnabled()) {
    return;
  }
  const currentSpanCtx = toolContext.getStore();
  if (!currentSpanCtx) {
    return;
  }
  const processedAttributes = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value === "string") {
      const { content, truncated } = truncateContent(value);
      processedAttributes[key] = content;
      if (truncated) {
        processedAttributes[`${key}_truncated`] = true;
        processedAttributes[`${key}_original_length`] = value.length;
      }
    } else {
      processedAttributes[key] = value;
    }
  }
  currentSpanCtx.span.addEvent(eventName, processedAttributes);
}
function getCurrentSpan() {
  if (!isAnyTracingEnabled()) {
    return null;
  }
  return toolContext.getStore()?.span ?? interactionContext.getStore()?.span ?? null;
}
async function executeInSpan(spanName, fn, attributes) {
  if (!isAnyTracingEnabled()) {
    return fn(trace.getActiveSpan() || getTracer().startSpan("dummy"));
  }
  const tracer = getTracer();
  const parentSpanCtx = toolContext.getStore() ?? interactionContext.getStore();
  const finalAttributes = createSpanAttributes("tool", {
    ...attributes
  });
  const ctx = parentSpanCtx ? trace.setSpan(otelContext.active(), parentSpanCtx.span) : otelContext.active();
  const span = tracer.startSpan(spanName, { attributes: finalAttributes }, ctx);
  const spanId = getSpanId(span);
  const spanContextObj = {
    span,
    startTime: Date.now(),
    attributes: finalAttributes
  };
  activeSpans.set(spanId, new WeakRef(spanContextObj));
  strongSpans.set(spanId, spanContextObj);
  try {
    const result = await fn(span);
    span.end();
    activeSpans.delete(spanId);
    strongSpans.delete(spanId);
    return result;
  } catch (error) {
    if (error instanceof Error) {
      span.recordException(error);
    }
    span.end();
    activeSpans.delete(spanId);
    strongSpans.delete(spanId);
    throw error;
  }
}
function startHookSpan(hookEvent, hookName, numHooks, hookDefinitions) {
  if (!isBetaTracingEnabled()) {
    return trace.getActiveSpan() || getTracer().startSpan("dummy");
  }
  const tracer = getTracer();
  const parentSpanCtx = toolContext.getStore() ?? interactionContext.getStore();
  const attributes = createSpanAttributes("hook", {
    hook_event: hookEvent,
    hook_name: hookName,
    num_hooks: numHooks,
    hook_definitions: hookDefinitions
  });
  const ctx = parentSpanCtx ? trace.setSpan(otelContext.active(), parentSpanCtx.span) : otelContext.active();
  const span = tracer.startSpan("claude_code.hook", { attributes }, ctx);
  const spanId = getSpanId(span);
  const spanContextObj = {
    span,
    startTime: Date.now(),
    attributes
  };
  activeSpans.set(spanId, new WeakRef(spanContextObj));
  strongSpans.set(spanId, spanContextObj);
  return span;
}
function endHookSpan(span, metadata) {
  if (!isBetaTracingEnabled()) {
    return;
  }
  const spanId = getSpanId(span);
  const spanContext = activeSpans.get(spanId)?.deref();
  if (!spanContext) {
    return;
  }
  const duration = Date.now() - spanContext.startTime;
  const endAttributes = {
    duration_ms: duration
  };
  if (metadata) {
    if (metadata.numSuccess !== void 0)
      endAttributes["num_success"] = metadata.numSuccess;
    if (metadata.numBlocking !== void 0)
      endAttributes["num_blocking"] = metadata.numBlocking;
    if (metadata.numNonBlockingError !== void 0)
      endAttributes["num_non_blocking_error"] = metadata.numNonBlockingError;
    if (metadata.numCancelled !== void 0)
      endAttributes["num_cancelled"] = metadata.numCancelled;
  }
  spanContext.span.setAttributes(endAttributes);
  spanContext.span.end();
  activeSpans.delete(spanId);
  strongSpans.delete(spanId);
}
export {
  addToolContentEvent,
  endHookSpan,
  endInteractionSpan,
  endLLMRequestSpan,
  endToolBlockedOnUserSpan,
  endToolExecutionSpan,
  endToolSpan,
  executeInSpan,
  getCurrentSpan,
  isBetaTracingEnabled,
  isEnhancedTelemetryEnabled,
  startHookSpan,
  startInteractionSpan,
  startLLMRequestSpan,
  startToolBlockedOnUserSpan,
  startToolExecutionSpan,
  startToolSpan
};
