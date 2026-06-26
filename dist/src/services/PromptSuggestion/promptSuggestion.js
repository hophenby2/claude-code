import { getIsNonInteractiveSession } from "../../bootstrap/state.js";
import { isAgentSwarmsEnabled } from "../../utils/agentSwarmsEnabled.js";
import { count } from "../../utils/array.js";
import { isEnvDefinedFalsy, isEnvTruthy } from "../../utils/envUtils.js";
import { toError } from "../../utils/errors.js";
import {
  createCacheSafeParams,
  runForkedAgent
} from "../../utils/forkedAgent.js";
import { logError } from "../../utils/log.js";
import {
  createUserMessage,
  getLastAssistantMessage
} from "../../utils/messages.js";
import { getInitialSettings } from "../../utils/settings/settings.js";
import { isTeammate } from "../../utils/teammate.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../analytics/growthbook.js";
import {
  logEvent
} from "../analytics/index.js";
import { currentLimits } from "../claudeAiLimits.js";
import { isSpeculationEnabled, startSpeculation } from "./speculation.js";
let currentAbortController = null;
function getPromptVariant() {
  return "user_intent";
}
function shouldEnablePromptSuggestion() {
  const envOverride = process.env.CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION;
  if (isEnvDefinedFalsy(envOverride)) {
    logEvent("tengu_prompt_suggestion_init", {
      enabled: false,
      source: "env"
    });
    return false;
  }
  if (isEnvTruthy(envOverride)) {
    logEvent("tengu_prompt_suggestion_init", {
      enabled: true,
      source: "env"
    });
    return true;
  }
  if (!getFeatureValue_CACHED_MAY_BE_STALE("tengu_chomp_inflection", false)) {
    logEvent("tengu_prompt_suggestion_init", {
      enabled: false,
      source: "growthbook"
    });
    return false;
  }
  if (getIsNonInteractiveSession()) {
    logEvent("tengu_prompt_suggestion_init", {
      enabled: false,
      source: "non_interactive"
    });
    return false;
  }
  if (isAgentSwarmsEnabled() && isTeammate()) {
    logEvent("tengu_prompt_suggestion_init", {
      enabled: false,
      source: "swarm_teammate"
    });
    return false;
  }
  const enabled = getInitialSettings()?.promptSuggestionEnabled !== false;
  logEvent("tengu_prompt_suggestion_init", {
    enabled,
    source: "setting"
  });
  return enabled;
}
function abortPromptSuggestion() {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
}
function getSuggestionSuppressReason(appState) {
  if (!appState.promptSuggestionEnabled) return "disabled";
  if (appState.pendingWorkerRequest || appState.pendingSandboxRequest)
    return "pending_permission";
  if (appState.elicitation.queue.length > 0) return "elicitation_active";
  if (appState.toolPermissionContext.mode === "plan") return "plan_mode";
  if (process.env.USER_TYPE === "external" && currentLimits.status !== "allowed")
    return "rate_limit";
  return null;
}
async function tryGenerateSuggestion(abortController, messages, getAppState, cacheSafeParams, source) {
  if (abortController.signal.aborted) {
    logSuggestionSuppressed("aborted", void 0, void 0, source);
    return null;
  }
  const assistantTurnCount = count(messages, (m) => m.type === "assistant");
  if (assistantTurnCount < 2) {
    logSuggestionSuppressed("early_conversation", void 0, void 0, source);
    return null;
  }
  const lastAssistantMessage = getLastAssistantMessage(messages);
  if (lastAssistantMessage?.isApiErrorMessage) {
    logSuggestionSuppressed("last_response_error", void 0, void 0, source);
    return null;
  }
  const cacheReason = getParentCacheSuppressReason(lastAssistantMessage);
  if (cacheReason) {
    logSuggestionSuppressed(cacheReason, void 0, void 0, source);
    return null;
  }
  const appState = getAppState();
  const suppressReason = getSuggestionSuppressReason(appState);
  if (suppressReason) {
    logSuggestionSuppressed(suppressReason, void 0, void 0, source);
    return null;
  }
  const promptId = getPromptVariant();
  const { suggestion, generationRequestId } = await generateSuggestion(
    abortController,
    promptId,
    cacheSafeParams
  );
  if (abortController.signal.aborted) {
    logSuggestionSuppressed("aborted", void 0, void 0, source);
    return null;
  }
  if (!suggestion) {
    logSuggestionSuppressed("empty", void 0, promptId, source);
    return null;
  }
  if (shouldFilterSuggestion(suggestion, promptId, source)) return null;
  return { suggestion, promptId, generationRequestId };
}
async function executePromptSuggestion(context) {
  if (context.querySource !== "repl_main_thread") return;
  currentAbortController = new AbortController();
  const abortController = currentAbortController;
  const cacheSafeParams = createCacheSafeParams(context);
  try {
    const result = await tryGenerateSuggestion(
      abortController,
      context.messages,
      context.toolUseContext.getAppState,
      cacheSafeParams,
      "cli"
    );
    if (!result) return;
    context.toolUseContext.setAppState((prev) => ({
      ...prev,
      promptSuggestion: {
        text: result.suggestion,
        promptId: result.promptId,
        shownAt: 0,
        acceptedAt: 0,
        generationRequestId: result.generationRequestId
      }
    }));
    if (isSpeculationEnabled() && result.suggestion) {
      void startSpeculation(
        result.suggestion,
        context,
        context.toolUseContext.setAppState,
        false,
        cacheSafeParams
      );
    }
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || error.name === "APIUserAbortError")) {
      logSuggestionSuppressed("aborted", void 0, void 0, "cli");
      return;
    }
    logError(toError(error));
  } finally {
    if (currentAbortController === abortController) {
      currentAbortController = null;
    }
  }
}
const MAX_PARENT_UNCACHED_TOKENS = 1e4;
function getParentCacheSuppressReason(lastAssistantMessage) {
  if (!lastAssistantMessage) return null;
  const usage = lastAssistantMessage.message.usage;
  const inputTokens = usage.input_tokens ?? 0;
  const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  return inputTokens + cacheWriteTokens + outputTokens > MAX_PARENT_UNCACHED_TOKENS ? "cache_cold" : null;
}
const SUGGESTION_PROMPT = `[SUGGESTION MODE: Suggest what the user might naturally type next into Claude Code.]

FIRST: Look at the user's recent messages and original request.

Your job is to predict what THEY would type - not what you think they should do.

THE TEST: Would they think "I was just about to type that"?

EXAMPLES:
User asked "fix the bug and run tests", bug is fixed \u2192 "run the tests"
After code written \u2192 "try it out"
Claude offers options \u2192 suggest the one the user would likely pick, based on conversation
Claude asks to continue \u2192 "yes" or "go ahead"
Task complete, obvious follow-up \u2192 "commit this" or "push it"
After error or misunderstanding \u2192 silence (let them assess/correct)

Be specific: "run the tests" beats "continue".

NEVER SUGGEST:
- Evaluative ("looks good", "thanks")
- Questions ("what about...?")
- Claude-voice ("Let me...", "I'll...", "Here's...")
- New ideas they didn't ask about
- Multiple sentences

Stay silent if the next step isn't obvious from what the user said.

Format: 2-12 words, match the user's style. Or nothing.

Reply with ONLY the suggestion, no quotes or explanation.`;
const SUGGESTION_PROMPTS = {
  user_intent: SUGGESTION_PROMPT,
  stated_intent: SUGGESTION_PROMPT
};
async function generateSuggestion(abortController, promptId, cacheSafeParams) {
  const prompt = SUGGESTION_PROMPTS[promptId];
  const canUseTool = async () => ({
    behavior: "deny",
    message: "No tools needed for suggestion",
    decisionReason: { type: "other", reason: "suggestion only" }
  });
  const result = await runForkedAgent({
    promptMessages: [createUserMessage({ content: prompt })],
    cacheSafeParams,
    // Don't override tools/thinking settings - busts cache
    canUseTool,
    querySource: "prompt_suggestion",
    forkLabel: "prompt_suggestion",
    overrides: {
      abortController
    },
    skipTranscript: true,
    skipCacheWrite: true
  });
  const firstAssistantMsg = result.messages.find((m) => m.type === "assistant");
  const generationRequestId = firstAssistantMsg?.type === "assistant" ? firstAssistantMsg.requestId ?? null : null;
  for (const msg of result.messages) {
    if (msg.type !== "assistant") continue;
    const textBlock = msg.message.content.find((b) => b.type === "text");
    if (textBlock?.type === "text") {
      const suggestion = textBlock.text.trim();
      if (suggestion) {
        return { suggestion, generationRequestId };
      }
    }
  }
  return { suggestion: null, generationRequestId };
}
function shouldFilterSuggestion(suggestion, promptId, source) {
  if (!suggestion) {
    logSuggestionSuppressed("empty", void 0, promptId, source);
    return true;
  }
  const lower = suggestion.toLowerCase();
  const wordCount = suggestion.trim().split(/\s+/).length;
  const filters = [
    ["done", () => lower === "done"],
    [
      "meta_text",
      () => lower === "nothing found" || lower === "nothing found." || lower.startsWith("nothing to suggest") || lower.startsWith("no suggestion") || // Model spells out the prompt's "stay silent" instruction
      /\bsilence is\b|\bstay(s|ing)? silent\b/.test(lower) || // Model outputs bare "silence" wrapped in punctuation/whitespace
      /^\W*silence\W*$/.test(lower)
    ],
    [
      "meta_wrapped",
      // Model wraps meta-reasoning in parens/brackets: (silence — ...), [no suggestion]
      () => /^\(.*\)$|^\[.*\]$/.test(suggestion)
    ],
    [
      "error_message",
      () => lower.startsWith("api error:") || lower.startsWith("prompt is too long") || lower.startsWith("request timed out") || lower.startsWith("invalid api key") || lower.startsWith("image was too large")
    ],
    ["prefixed_label", () => /^\w+:\s/.test(suggestion)],
    [
      "too_few_words",
      () => {
        if (wordCount >= 2) return false;
        if (suggestion.startsWith("/")) return false;
        const ALLOWED_SINGLE_WORDS = /* @__PURE__ */ new Set([
          // Affirmatives
          "yes",
          "yeah",
          "yep",
          "yea",
          "yup",
          "sure",
          "ok",
          "okay",
          // Actions
          "push",
          "commit",
          "deploy",
          "stop",
          "continue",
          "check",
          "exit",
          "quit",
          // Negation
          "no"
        ]);
        return !ALLOWED_SINGLE_WORDS.has(lower);
      }
    ],
    ["too_many_words", () => wordCount > 12],
    ["too_long", () => suggestion.length >= 100],
    ["multiple_sentences", () => /[.!?]\s+[A-Z]/.test(suggestion)],
    ["has_formatting", () => /[\n*]|\*\*/.test(suggestion)],
    [
      "evaluative",
      () => /thanks|thank you|looks good|sounds good|that works|that worked|that's all|nice|great|perfect|makes sense|awesome|excellent/.test(
        lower
      )
    ],
    [
      "claude_voice",
      () => /^(let me|i'll|i've|i'm|i can|i would|i think|i notice|here's|here is|here are|that's|this is|this will|you can|you should|you could|sure,|of course|certainly)/i.test(
        suggestion
      )
    ]
  ];
  for (const [reason, check] of filters) {
    if (check()) {
      logSuggestionSuppressed(reason, suggestion, promptId, source);
      return true;
    }
  }
  return false;
}
function logSuggestionOutcome(suggestion, userInput, emittedAt, promptId, generationRequestId) {
  const similarity = Math.round(userInput.length / (suggestion.length || 1) * 100) / 100;
  const wasAccepted = userInput === suggestion;
  const timeMs = Math.max(0, Date.now() - emittedAt);
  logEvent("tengu_prompt_suggestion", {
    source: "sdk",
    outcome: wasAccepted ? "accepted" : "ignored",
    prompt_id: promptId,
    ...generationRequestId && {
      generationRequestId
    },
    ...wasAccepted && {
      timeToAcceptMs: timeMs
    },
    ...!wasAccepted && { timeToIgnoreMs: timeMs },
    similarity,
    ...process.env.USER_TYPE === "ant" && {
      suggestion,
      userInput
    }
  });
}
function logSuggestionSuppressed(reason, suggestion, promptId, source) {
  const resolvedPromptId = promptId ?? getPromptVariant();
  logEvent("tengu_prompt_suggestion", {
    ...source && {
      source
    },
    outcome: "suppressed",
    reason,
    prompt_id: resolvedPromptId,
    ...process.env.USER_TYPE === "ant" && suggestion && {
      suggestion
    }
  });
}
export {
  abortPromptSuggestion,
  executePromptSuggestion,
  generateSuggestion,
  getParentCacheSuppressReason,
  getPromptVariant,
  getSuggestionSuppressReason,
  logSuggestionOutcome,
  logSuggestionSuppressed,
  shouldEnablePromptSuggestion,
  shouldFilterSuggestion,
  tryGenerateSuggestion
};
