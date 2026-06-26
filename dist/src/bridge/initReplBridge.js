const feature = (_name) => false;
import { hostname } from "os";
import { getOriginalCwd, getSessionId } from "../bootstrap/state.js";
import { getFeatureValue_CACHED_WITH_REFRESH } from "../services/analytics/growthbook.js";
import { getOrganizationUUID } from "../services/oauth/client.js";
import {
  isPolicyAllowed,
  waitForPolicyLimitsToLoad
} from "../services/policyLimits/index.js";
import {
  checkAndRefreshOAuthTokenIfNeeded,
  getClaudeAIOAuthTokens,
  handleOAuth401Error
} from "../utils/auth.js";
import { getGlobalConfig, saveGlobalConfig } from "../utils/config.js";
import { logForDebugging } from "../utils/debug.js";
import { stripDisplayTagsAllowEmpty } from "../utils/displayTags.js";
import { errorMessage } from "../utils/errors.js";
import { getBranch, getRemoteUrl } from "../utils/git.js";
import { toSDKMessages } from "../utils/messages/mappers.js";
import {
  getContentText,
  getMessagesAfterCompactBoundary,
  isSyntheticMessage
} from "../utils/messages.js";
import { getCurrentSessionTitle } from "../utils/sessionStorage.js";
import {
  extractConversationText,
  generateSessionTitle
} from "../utils/sessionTitle.js";
import { generateShortWordSlug } from "../utils/words.js";
import {
  getBridgeAccessToken,
  getBridgeBaseUrl,
  getBridgeTokenOverride
} from "./bridgeConfig.js";
import {
  checkBridgeMinVersion,
  isBridgeEnabledBlocking,
  isCseShimEnabled,
  isEnvLessBridgeEnabled
} from "./bridgeEnabled.js";
import {
  archiveBridgeSession,
  createBridgeSession,
  updateBridgeSessionTitle
} from "./createSession.js";
import { logBridgeSkip } from "./debugUtils.js";
import { checkEnvLessBridgeMinVersion } from "./envLessBridgeConfig.js";
import { getPollIntervalConfig } from "./pollConfig.js";
import { initBridgeCore } from "./replBridge.js";
import { setCseShimGate } from "./sessionIdCompat.js";
async function initReplBridge(options) {
  const {
    onInboundMessage,
    onPermissionResponse,
    onInterrupt,
    onSetModel,
    onSetMaxThinkingTokens,
    onSetPermissionMode,
    onStateChange,
    initialMessages,
    getMessages,
    previouslyFlushedUUIDs,
    initialName,
    perpetual,
    outboundOnly,
    tags
  } = options ?? {};
  setCseShimGate(isCseShimEnabled);
  if (!await isBridgeEnabledBlocking()) {
    logBridgeSkip("not_enabled", "[bridge:repl] Skipping: bridge not enabled");
    return null;
  }
  if (!getBridgeAccessToken()) {
    logBridgeSkip("no_oauth", "[bridge:repl] Skipping: no OAuth tokens");
    onStateChange?.("failed", "/login");
    return null;
  }
  await waitForPolicyLimitsToLoad();
  if (!isPolicyAllowed("allow_remote_control")) {
    logBridgeSkip(
      "policy_denied",
      "[bridge:repl] Skipping: allow_remote_control policy not allowed"
    );
    onStateChange?.("failed", "disabled by your organization's policy");
    return null;
  }
  if (!getBridgeTokenOverride()) {
    const cfg = getGlobalConfig();
    if (cfg.bridgeOauthDeadExpiresAt != null && (cfg.bridgeOauthDeadFailCount ?? 0) >= 3 && getClaudeAIOAuthTokens()?.expiresAt === cfg.bridgeOauthDeadExpiresAt) {
      logForDebugging(
        `[bridge:repl] Skipping: cross-process backoff (dead token seen ${cfg.bridgeOauthDeadFailCount} times)`
      );
      return null;
    }
    await checkAndRefreshOAuthTokenIfNeeded();
    const tokens = getClaudeAIOAuthTokens();
    if (tokens && tokens.expiresAt !== null && tokens.expiresAt <= Date.now()) {
      logBridgeSkip(
        "oauth_expired_unrefreshable",
        "[bridge:repl] Skipping: OAuth token expired and refresh failed (re-login required)"
      );
      onStateChange?.("failed", "/login");
      const deadExpiresAt = tokens.expiresAt;
      saveGlobalConfig((c) => ({
        ...c,
        bridgeOauthDeadExpiresAt: deadExpiresAt,
        bridgeOauthDeadFailCount: c.bridgeOauthDeadExpiresAt === deadExpiresAt ? (c.bridgeOauthDeadFailCount ?? 0) + 1 : 1
      }));
      return null;
    }
  }
  const baseUrl = getBridgeBaseUrl();
  let title = `remote-control-${generateShortWordSlug()}`;
  let hasTitle = false;
  let hasExplicitTitle = false;
  if (initialName) {
    title = initialName;
    hasTitle = true;
    hasExplicitTitle = true;
  } else {
    const sessionId = getSessionId();
    const customTitle = sessionId ? getCurrentSessionTitle(sessionId) : void 0;
    if (customTitle) {
      title = customTitle;
      hasTitle = true;
      hasExplicitTitle = true;
    } else if (initialMessages && initialMessages.length > 0) {
      for (let i = initialMessages.length - 1; i >= 0; i--) {
        const msg = initialMessages[i];
        if (msg.type !== "user" || msg.isMeta || msg.toolUseResult || msg.isCompactSummary || msg.origin && msg.origin.kind !== "human" || isSyntheticMessage(msg))
          continue;
        const rawContent = getContentText(msg.message.content);
        if (!rawContent) continue;
        const derived = deriveTitle(rawContent);
        if (!derived) continue;
        title = derived;
        hasTitle = true;
        break;
      }
    }
  }
  let userMessageCount = 0;
  let lastBridgeSessionId;
  let genSeq = 0;
  const patch = (derived, bridgeSessionId, atCount) => {
    hasTitle = true;
    title = derived;
    logForDebugging(
      `[bridge:repl] derived title from message ${atCount}: ${derived}`
    );
    void updateBridgeSessionTitle(bridgeSessionId, derived, {
      baseUrl,
      getAccessToken: getBridgeAccessToken
    }).catch(() => {
    });
  };
  const generateAndPatch = (input, bridgeSessionId) => {
    const gen = ++genSeq;
    const atCount = userMessageCount;
    void generateSessionTitle(input, AbortSignal.timeout(15e3)).then(
      (generated) => {
        if (generated && gen === genSeq && lastBridgeSessionId === bridgeSessionId && !getCurrentSessionTitle(getSessionId())) {
          patch(generated, bridgeSessionId, atCount);
        }
      }
    );
  };
  const onUserMessage = (text, bridgeSessionId) => {
    if (hasExplicitTitle || getCurrentSessionTitle(getSessionId())) {
      return true;
    }
    if (lastBridgeSessionId !== void 0 && lastBridgeSessionId !== bridgeSessionId) {
      userMessageCount = 0;
    }
    lastBridgeSessionId = bridgeSessionId;
    userMessageCount++;
    if (userMessageCount === 1 && !hasTitle) {
      const placeholder = deriveTitle(text);
      if (placeholder) patch(placeholder, bridgeSessionId, userMessageCount);
      generateAndPatch(text, bridgeSessionId);
    } else if (userMessageCount === 3) {
      const msgs = getMessages?.();
      const input = msgs ? extractConversationText(getMessagesAfterCompactBoundary(msgs)) : text;
      generateAndPatch(input, bridgeSessionId);
    }
    return userMessageCount >= 3;
  };
  const initialHistoryCap = getFeatureValue_CACHED_WITH_REFRESH(
    "tengu_bridge_initial_history_cap",
    200,
    5 * 60 * 1e3
  );
  const orgUUID = await getOrganizationUUID();
  if (!orgUUID) {
    logBridgeSkip("no_org_uuid", "[bridge:repl] Skipping: no org UUID");
    onStateChange?.("failed", "/login");
    return null;
  }
  if (isEnvLessBridgeEnabled() && !perpetual) {
    const versionError2 = await checkEnvLessBridgeMinVersion();
    if (versionError2) {
      logBridgeSkip(
        "version_too_old",
        `[bridge:repl] Skipping: ${versionError2}`,
        true
      );
      onStateChange?.("failed", "run `claude update` to upgrade");
      return null;
    }
    logForDebugging(
      "[bridge:repl] Using env-less bridge path (tengu_bridge_repl_v2)"
    );
    const { initEnvLessBridgeCore } = await import("./remoteBridgeCore.js");
    return initEnvLessBridgeCore({
      baseUrl,
      orgUUID,
      title,
      getAccessToken: getBridgeAccessToken,
      onAuth401: handleOAuth401Error,
      toSDKMessages,
      initialHistoryCap,
      initialMessages,
      // v2 always creates a fresh server session (new cse_* id), so
      // previouslyFlushedUUIDs is not passed — there's no cross-session
      // UUID collision risk, and the ref persists across enable→disable→
      // re-enable cycles which would cause the new session to receive zero
      // history (all UUIDs already in the set from the prior enable).
      // v1 handles this by calling previouslyFlushedUUIDs.clear() on fresh
      // session creation (replBridge.ts:768); v2 skips the param entirely.
      onInboundMessage,
      onUserMessage,
      onPermissionResponse,
      onInterrupt,
      onSetModel,
      onSetMaxThinkingTokens,
      onSetPermissionMode,
      onStateChange,
      outboundOnly,
      tags
    });
  }
  const versionError = checkBridgeMinVersion();
  if (versionError) {
    logBridgeSkip("version_too_old", `[bridge:repl] Skipping: ${versionError}`);
    onStateChange?.("failed", "run `claude update` to upgrade");
    return null;
  }
  const branch = await getBranch();
  const gitRepoUrl = await getRemoteUrl();
  const sessionIngressUrl = process.env.USER_TYPE === "ant" && process.env.CLAUDE_BRIDGE_SESSION_INGRESS_URL ? process.env.CLAUDE_BRIDGE_SESSION_INGRESS_URL : baseUrl;
  let workerType = "claude_code";
  if (false) {
    const { isAssistantMode } = null;
    if (isAssistantMode()) {
      workerType = "claude_code_assistant";
    }
  }
  return initBridgeCore({
    dir: getOriginalCwd(),
    machineName: hostname(),
    branch,
    gitRepoUrl,
    title,
    baseUrl,
    sessionIngressUrl,
    workerType,
    getAccessToken: getBridgeAccessToken,
    createSession: (opts) => createBridgeSession({
      ...opts,
      events: [],
      baseUrl,
      getAccessToken: getBridgeAccessToken
    }),
    archiveSession: (sessionId) => archiveBridgeSession(sessionId, {
      baseUrl,
      getAccessToken: getBridgeAccessToken,
      // gracefulShutdown.ts:407 races runCleanupFunctions against 2s.
      // Teardown also does stopWork (parallel) + deregister (sequential),
      // so archive can't have the full budget. 1.5s matches v2's
      // teardown_archive_timeout_ms default.
      timeoutMs: 1500
    }).catch((err) => {
      logForDebugging(
        `[bridge:repl] archiveBridgeSession threw: ${errorMessage(err)}`,
        { level: "error" }
      );
    }),
    // getCurrentTitle is read on reconnect-after-env-lost to re-title the new
    // session. /rename writes to session storage; onUserMessage mutates
    // `title` directly — both paths are picked up here.
    getCurrentTitle: () => getCurrentSessionTitle(getSessionId()) ?? title,
    onUserMessage,
    toSDKMessages,
    onAuth401: handleOAuth401Error,
    getPollIntervalConfig,
    initialHistoryCap,
    initialMessages,
    previouslyFlushedUUIDs,
    onInboundMessage,
    onPermissionResponse,
    onInterrupt,
    onSetModel,
    onSetMaxThinkingTokens,
    onSetPermissionMode,
    onStateChange,
    perpetual
  });
}
const TITLE_MAX_LEN = 50;
function deriveTitle(raw) {
  const clean = stripDisplayTagsAllowEmpty(raw);
  const firstSentence = /^(.*?[.!?])\s/.exec(clean)?.[1] ?? clean;
  const flat = firstSentence.replace(/\s+/g, " ").trim();
  if (!flat) return void 0;
  return flat.length > TITLE_MAX_LEN ? flat.slice(0, TITLE_MAX_LEN - 1) + "\u2026" : flat;
}
export {
  initReplBridge
};
