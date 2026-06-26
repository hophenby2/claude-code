import { realpathSync } from "fs";
import sumBy from "lodash-es/sumBy.js";
import { cwd } from "process";
import { randomUUID } from "../utils/crypto.js";
import { resetSettingsCache } from "../utils/settings/settingsCache.js";
import { createSignal } from "../utils/signal.js";
function getInitialState() {
  let resolvedCwd = "";
  if (typeof process !== "undefined" && typeof process.cwd === "function" && typeof realpathSync === "function") {
    const rawCwd = cwd();
    try {
      resolvedCwd = realpathSync(rawCwd).normalize("NFC");
    } catch {
      resolvedCwd = rawCwd.normalize("NFC");
    }
  }
  const state = {
    originalCwd: resolvedCwd,
    projectRoot: resolvedCwd,
    totalCostUSD: 0,
    totalAPIDuration: 0,
    totalAPIDurationWithoutRetries: 0,
    totalToolDuration: 0,
    turnHookDurationMs: 0,
    turnToolDurationMs: 0,
    turnClassifierDurationMs: 0,
    turnToolCount: 0,
    turnHookCount: 0,
    turnClassifierCount: 0,
    startTime: Date.now(),
    lastInteractionTime: Date.now(),
    totalLinesAdded: 0,
    totalLinesRemoved: 0,
    hasUnknownModelCost: false,
    cwd: resolvedCwd,
    modelUsage: {},
    mainLoopModelOverride: void 0,
    initialMainLoopModel: null,
    modelStrings: null,
    isInteractive: false,
    kairosActive: false,
    strictToolResultPairing: false,
    sdkAgentProgressSummariesEnabled: false,
    userMsgOptIn: false,
    clientType: "cli",
    sessionSource: void 0,
    questionPreviewFormat: void 0,
    sessionIngressToken: void 0,
    oauthTokenFromFd: void 0,
    apiKeyFromFd: void 0,
    flagSettingsPath: void 0,
    flagSettingsInline: null,
    allowedSettingSources: [
      "userSettings",
      "projectSettings",
      "localSettings",
      "flagSettings",
      "policySettings"
    ],
    // Telemetry state
    meter: null,
    sessionCounter: null,
    locCounter: null,
    prCounter: null,
    commitCounter: null,
    costCounter: null,
    tokenCounter: null,
    codeEditToolDecisionCounter: null,
    activeTimeCounter: null,
    statsStore: null,
    sessionId: randomUUID(),
    parentSessionId: void 0,
    // Logger state
    loggerProvider: null,
    eventLogger: null,
    // Meter provider state
    meterProvider: null,
    tracerProvider: null,
    // Agent color state
    agentColorMap: /* @__PURE__ */ new Map(),
    agentColorIndex: 0,
    // Last API request for bug reports
    lastAPIRequest: null,
    lastAPIRequestMessages: null,
    // Last auto-mode classifier request(s) for /share transcript
    lastClassifierRequests: null,
    cachedClaudeMdContent: null,
    // In-memory error log for recent errors
    inMemoryErrorLog: [],
    // Session-only plugins from --plugin-dir flag
    inlinePlugins: [],
    // Explicit --chrome / --no-chrome flag value (undefined = not set on CLI)
    chromeFlagOverride: void 0,
    // Use cowork_plugins directory instead of plugins
    useCoworkPlugins: false,
    // Session-only bypass permissions mode flag (not persisted)
    sessionBypassPermissionsMode: false,
    // Scheduled tasks disabled until flag or dialog enables them
    scheduledTasksEnabled: false,
    sessionCronTasks: [],
    sessionCreatedTeams: /* @__PURE__ */ new Set(),
    // Session-only trust flag (not persisted to disk)
    sessionTrustAccepted: false,
    // Session-only flag to disable session persistence to disk
    sessionPersistenceDisabled: false,
    // Track if user has exited plan mode in this session
    hasExitedPlanMode: false,
    // Track if we need to show the plan mode exit attachment
    needsPlanModeExitAttachment: false,
    // Track if we need to show the auto mode exit attachment
    needsAutoModeExitAttachment: false,
    // Track if LSP plugin recommendation has been shown this session
    lspRecommendationShownThisSession: false,
    // SDK init event state
    initJsonSchema: null,
    registeredHooks: null,
    // Cache for plan slugs
    planSlugCache: /* @__PURE__ */ new Map(),
    // Track teleported session for reliability logging
    teleportedSessionInfo: null,
    // Track invoked skills for preservation across compaction
    invokedSkills: /* @__PURE__ */ new Map(),
    // Track slow operations for dev bar display
    slowOperations: [],
    // SDK-provided betas
    sdkBetas: void 0,
    // Main thread agent type
    mainThreadAgentType: void 0,
    // Remote mode
    isRemoteMode: false,
    ...process.env.USER_TYPE === "ant" ? {
      replBridgeActive: false
    } : {},
    // Direct connect server URL
    directConnectServerUrl: void 0,
    // System prompt section cache state
    systemPromptSectionCache: /* @__PURE__ */ new Map(),
    // Last date emitted to the model
    lastEmittedDate: null,
    // Additional directories from --add-dir flag (for CLAUDE.md loading)
    additionalDirectoriesForClaudeMd: [],
    // Channel server allowlist from --channels flag
    allowedChannels: [],
    hasDevChannels: false,
    // Session project dir (null = derive from originalCwd)
    sessionProjectDir: null,
    // Prompt cache 1h allowlist (null = not yet fetched from GrowthBook)
    promptCache1hAllowlist: null,
    // Prompt cache 1h eligibility (null = not yet evaluated)
    promptCache1hEligible: null,
    // Beta header latches (null = not yet triggered)
    afkModeHeaderLatched: null,
    fastModeHeaderLatched: null,
    cacheEditingHeaderLatched: null,
    thinkingClearLatched: null,
    // Current prompt ID
    promptId: null,
    lastMainRequestId: void 0,
    lastApiCompletionTimestamp: null,
    pendingPostCompaction: false
  };
  return state;
}
function isReplBridgeActive() {
  return Boolean(STATE.replBridgeActive);
}
const STATE = getInitialState();
function getSessionId() {
  return STATE.sessionId;
}
function regenerateSessionId(options = {}) {
  if (options.setCurrentAsParent) {
    STATE.parentSessionId = STATE.sessionId;
  }
  STATE.planSlugCache.delete(STATE.sessionId);
  STATE.sessionId = randomUUID();
  STATE.sessionProjectDir = null;
  return STATE.sessionId;
}
function getParentSessionId() {
  return STATE.parentSessionId;
}
function switchSession(sessionId, projectDir = null) {
  STATE.planSlugCache.delete(STATE.sessionId);
  STATE.sessionId = sessionId;
  STATE.sessionProjectDir = projectDir;
  sessionSwitched.emit(sessionId);
}
const sessionSwitched = createSignal();
const onSessionSwitch = sessionSwitched.subscribe;
function getSessionProjectDir() {
  return STATE.sessionProjectDir;
}
function getOriginalCwd() {
  return STATE.originalCwd;
}
function getProjectRoot() {
  return STATE.projectRoot;
}
function setOriginalCwd(cwd2) {
  STATE.originalCwd = cwd2.normalize("NFC");
}
function setProjectRoot(cwd2) {
  STATE.projectRoot = cwd2.normalize("NFC");
}
function getCwdState() {
  return STATE.cwd;
}
function setCwdState(cwd2) {
  STATE.cwd = cwd2.normalize("NFC");
}
function getDirectConnectServerUrl() {
  return STATE.directConnectServerUrl;
}
function setDirectConnectServerUrl(url) {
  STATE.directConnectServerUrl = url;
}
function addToTotalDurationState(duration, durationWithoutRetries) {
  STATE.totalAPIDuration += duration;
  STATE.totalAPIDurationWithoutRetries += durationWithoutRetries;
}
function resetTotalDurationStateAndCost_FOR_TESTS_ONLY() {
  STATE.totalAPIDuration = 0;
  STATE.totalAPIDurationWithoutRetries = 0;
  STATE.totalCostUSD = 0;
}
function addToTotalCostState(cost, modelUsage, model) {
  STATE.modelUsage[model] = modelUsage;
  STATE.totalCostUSD += cost;
}
function getTotalCostUSD() {
  return STATE.totalCostUSD;
}
function getTotalAPIDuration() {
  return STATE.totalAPIDuration;
}
function getTotalDuration() {
  return Date.now() - STATE.startTime;
}
function getTotalAPIDurationWithoutRetries() {
  return STATE.totalAPIDurationWithoutRetries;
}
function getTotalToolDuration() {
  return STATE.totalToolDuration;
}
function addToToolDuration(duration) {
  STATE.totalToolDuration += duration;
  STATE.turnToolDurationMs += duration;
  STATE.turnToolCount++;
}
function getTurnHookDurationMs() {
  return STATE.turnHookDurationMs;
}
function addToTurnHookDuration(duration) {
  STATE.turnHookDurationMs += duration;
  STATE.turnHookCount++;
}
function resetTurnHookDuration() {
  STATE.turnHookDurationMs = 0;
  STATE.turnHookCount = 0;
}
function getTurnHookCount() {
  return STATE.turnHookCount;
}
function getTurnToolDurationMs() {
  return STATE.turnToolDurationMs;
}
function resetTurnToolDuration() {
  STATE.turnToolDurationMs = 0;
  STATE.turnToolCount = 0;
}
function getTurnToolCount() {
  return STATE.turnToolCount;
}
function getTurnClassifierDurationMs() {
  return STATE.turnClassifierDurationMs;
}
function addToTurnClassifierDuration(duration) {
  STATE.turnClassifierDurationMs += duration;
  STATE.turnClassifierCount++;
}
function resetTurnClassifierDuration() {
  STATE.turnClassifierDurationMs = 0;
  STATE.turnClassifierCount = 0;
}
function getTurnClassifierCount() {
  return STATE.turnClassifierCount;
}
function getStatsStore() {
  return STATE.statsStore;
}
function setStatsStore(store) {
  STATE.statsStore = store;
}
let interactionTimeDirty = false;
function updateLastInteractionTime(immediate) {
  if (immediate) {
    flushInteractionTime_inner();
  } else {
    interactionTimeDirty = true;
  }
}
function flushInteractionTime() {
  if (interactionTimeDirty) {
    flushInteractionTime_inner();
  }
}
function flushInteractionTime_inner() {
  STATE.lastInteractionTime = Date.now();
  interactionTimeDirty = false;
}
function addToTotalLinesChanged(added, removed) {
  STATE.totalLinesAdded += added;
  STATE.totalLinesRemoved += removed;
}
function getTotalLinesAdded() {
  return STATE.totalLinesAdded;
}
function getTotalLinesRemoved() {
  return STATE.totalLinesRemoved;
}
function getTotalInputTokens() {
  return sumBy(Object.values(STATE.modelUsage), "inputTokens");
}
function getTotalOutputTokens() {
  return sumBy(Object.values(STATE.modelUsage), "outputTokens");
}
function getTotalCacheReadInputTokens() {
  return sumBy(Object.values(STATE.modelUsage), "cacheReadInputTokens");
}
function getTotalCacheCreationInputTokens() {
  return sumBy(Object.values(STATE.modelUsage), "cacheCreationInputTokens");
}
function getTotalWebSearchRequests() {
  return sumBy(Object.values(STATE.modelUsage), "webSearchRequests");
}
let outputTokensAtTurnStart = 0;
let currentTurnTokenBudget = null;
function getTurnOutputTokens() {
  return getTotalOutputTokens() - outputTokensAtTurnStart;
}
function getCurrentTurnTokenBudget() {
  return currentTurnTokenBudget;
}
let budgetContinuationCount = 0;
function snapshotOutputTokensForTurn(budget) {
  outputTokensAtTurnStart = getTotalOutputTokens();
  currentTurnTokenBudget = budget;
  budgetContinuationCount = 0;
}
function getBudgetContinuationCount() {
  return budgetContinuationCount;
}
function incrementBudgetContinuationCount() {
  budgetContinuationCount++;
}
function setHasUnknownModelCost() {
  STATE.hasUnknownModelCost = true;
}
function hasUnknownModelCost() {
  return STATE.hasUnknownModelCost;
}
function getLastMainRequestId() {
  return STATE.lastMainRequestId;
}
function setLastMainRequestId(requestId) {
  STATE.lastMainRequestId = requestId;
}
function getLastApiCompletionTimestamp() {
  return STATE.lastApiCompletionTimestamp;
}
function setLastApiCompletionTimestamp(timestamp) {
  STATE.lastApiCompletionTimestamp = timestamp;
}
function markPostCompaction() {
  STATE.pendingPostCompaction = true;
}
function consumePostCompaction() {
  const was = STATE.pendingPostCompaction;
  STATE.pendingPostCompaction = false;
  return was;
}
function getLastInteractionTime() {
  return STATE.lastInteractionTime;
}
let scrollDraining = false;
let scrollDrainTimer;
const SCROLL_DRAIN_IDLE_MS = 150;
function markScrollActivity() {
  scrollDraining = true;
  if (scrollDrainTimer) clearTimeout(scrollDrainTimer);
  scrollDrainTimer = setTimeout(() => {
    scrollDraining = false;
    scrollDrainTimer = void 0;
  }, SCROLL_DRAIN_IDLE_MS);
  scrollDrainTimer.unref?.();
}
function getIsScrollDraining() {
  return scrollDraining;
}
async function waitForScrollIdle() {
  while (scrollDraining) {
    await new Promise((r) => setTimeout(r, SCROLL_DRAIN_IDLE_MS).unref?.());
  }
}
function getModelUsage() {
  return STATE.modelUsage;
}
function getUsageForModel(model) {
  return STATE.modelUsage[model];
}
function getMainLoopModelOverride() {
  return STATE.mainLoopModelOverride;
}
function getInitialMainLoopModel() {
  return STATE.initialMainLoopModel;
}
function setMainLoopModelOverride(model) {
  STATE.mainLoopModelOverride = model;
}
function setInitialMainLoopModel(model) {
  STATE.initialMainLoopModel = model;
}
function getSdkBetas() {
  return STATE.sdkBetas;
}
function setSdkBetas(betas) {
  STATE.sdkBetas = betas;
}
function resetCostState() {
  STATE.totalCostUSD = 0;
  STATE.totalAPIDuration = 0;
  STATE.totalAPIDurationWithoutRetries = 0;
  STATE.totalToolDuration = 0;
  STATE.startTime = Date.now();
  STATE.totalLinesAdded = 0;
  STATE.totalLinesRemoved = 0;
  STATE.hasUnknownModelCost = false;
  STATE.modelUsage = {};
  STATE.promptId = null;
}
function setCostStateForRestore({
  totalCostUSD,
  totalAPIDuration,
  totalAPIDurationWithoutRetries,
  totalToolDuration,
  totalLinesAdded,
  totalLinesRemoved,
  lastDuration,
  modelUsage
}) {
  STATE.totalCostUSD = totalCostUSD;
  STATE.totalAPIDuration = totalAPIDuration;
  STATE.totalAPIDurationWithoutRetries = totalAPIDurationWithoutRetries;
  STATE.totalToolDuration = totalToolDuration;
  STATE.totalLinesAdded = totalLinesAdded;
  STATE.totalLinesRemoved = totalLinesRemoved;
  if (modelUsage) {
    STATE.modelUsage = modelUsage;
  }
  if (lastDuration) {
    STATE.startTime = Date.now() - lastDuration;
  }
}
function resetStateForTests() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("resetStateForTests can only be called in tests");
  }
  Object.entries(getInitialState()).forEach(([key, value]) => {
    STATE[key] = value;
  });
  outputTokensAtTurnStart = 0;
  currentTurnTokenBudget = null;
  budgetContinuationCount = 0;
  sessionSwitched.clear();
}
function getModelStrings() {
  return STATE.modelStrings;
}
function setModelStrings(modelStrings) {
  STATE.modelStrings = modelStrings;
}
function resetModelStringsForTestingOnly() {
  STATE.modelStrings = null;
}
function setMeter(meter, createCounter) {
  STATE.meter = meter;
  STATE.sessionCounter = createCounter("claude_code.session.count", {
    description: "Count of CLI sessions started"
  });
  STATE.locCounter = createCounter("claude_code.lines_of_code.count", {
    description: "Count of lines of code modified, with the 'type' attribute indicating whether lines were added or removed"
  });
  STATE.prCounter = createCounter("claude_code.pull_request.count", {
    description: "Number of pull requests created"
  });
  STATE.commitCounter = createCounter("claude_code.commit.count", {
    description: "Number of git commits created"
  });
  STATE.costCounter = createCounter("claude_code.cost.usage", {
    description: "Cost of the Claude Code session",
    unit: "USD"
  });
  STATE.tokenCounter = createCounter("claude_code.token.usage", {
    description: "Number of tokens used",
    unit: "tokens"
  });
  STATE.codeEditToolDecisionCounter = createCounter(
    "claude_code.code_edit_tool.decision",
    {
      description: "Count of code editing tool permission decisions (accept/reject) for Edit, Write, and NotebookEdit tools"
    }
  );
  STATE.activeTimeCounter = createCounter("claude_code.active_time.total", {
    description: "Total active time in seconds",
    unit: "s"
  });
}
function getMeter() {
  return STATE.meter;
}
function getSessionCounter() {
  return STATE.sessionCounter;
}
function getLocCounter() {
  return STATE.locCounter;
}
function getPrCounter() {
  return STATE.prCounter;
}
function getCommitCounter() {
  return STATE.commitCounter;
}
function getCostCounter() {
  return STATE.costCounter;
}
function getTokenCounter() {
  return STATE.tokenCounter;
}
function getCodeEditToolDecisionCounter() {
  return STATE.codeEditToolDecisionCounter;
}
function getActiveTimeCounter() {
  return STATE.activeTimeCounter;
}
function getLoggerProvider() {
  return STATE.loggerProvider;
}
function setLoggerProvider(provider) {
  STATE.loggerProvider = provider;
}
function getEventLogger() {
  return STATE.eventLogger;
}
function setEventLogger(logger) {
  STATE.eventLogger = logger;
}
function getMeterProvider() {
  return STATE.meterProvider;
}
function setMeterProvider(provider) {
  STATE.meterProvider = provider;
}
function getTracerProvider() {
  return STATE.tracerProvider;
}
function setTracerProvider(provider) {
  STATE.tracerProvider = provider;
}
function getIsNonInteractiveSession() {
  return !STATE.isInteractive;
}
function getIsInteractive() {
  return STATE.isInteractive;
}
function setIsInteractive(value) {
  STATE.isInteractive = value;
}
function getClientType() {
  return STATE.clientType;
}
function setClientType(type) {
  STATE.clientType = type;
}
function getSdkAgentProgressSummariesEnabled() {
  return STATE.sdkAgentProgressSummariesEnabled;
}
function setSdkAgentProgressSummariesEnabled(value) {
  STATE.sdkAgentProgressSummariesEnabled = value;
}
function getKairosActive() {
  return STATE.kairosActive;
}
function setKairosActive(value) {
  STATE.kairosActive = value;
}
function getStrictToolResultPairing() {
  return STATE.strictToolResultPairing;
}
function setStrictToolResultPairing(value) {
  STATE.strictToolResultPairing = value;
}
function getUserMsgOptIn() {
  return STATE.userMsgOptIn;
}
function setUserMsgOptIn(value) {
  STATE.userMsgOptIn = value;
}
function getSessionSource() {
  return STATE.sessionSource;
}
function setSessionSource(source) {
  STATE.sessionSource = source;
}
function getQuestionPreviewFormat() {
  return STATE.questionPreviewFormat;
}
function setQuestionPreviewFormat(format) {
  STATE.questionPreviewFormat = format;
}
function getAgentColorMap() {
  return STATE.agentColorMap;
}
function getFlagSettingsPath() {
  return STATE.flagSettingsPath;
}
function setFlagSettingsPath(path) {
  STATE.flagSettingsPath = path;
}
function getFlagSettingsInline() {
  return STATE.flagSettingsInline;
}
function setFlagSettingsInline(settings) {
  STATE.flagSettingsInline = settings;
}
function getSessionIngressToken() {
  return STATE.sessionIngressToken;
}
function setSessionIngressToken(token) {
  STATE.sessionIngressToken = token;
}
function getOauthTokenFromFd() {
  return STATE.oauthTokenFromFd;
}
function setOauthTokenFromFd(token) {
  STATE.oauthTokenFromFd = token;
}
function getApiKeyFromFd() {
  return STATE.apiKeyFromFd;
}
function setApiKeyFromFd(key) {
  STATE.apiKeyFromFd = key;
}
function setLastAPIRequest(params) {
  STATE.lastAPIRequest = params;
}
function getLastAPIRequest() {
  return STATE.lastAPIRequest;
}
function setLastAPIRequestMessages(messages) {
  STATE.lastAPIRequestMessages = messages;
}
function getLastAPIRequestMessages() {
  return STATE.lastAPIRequestMessages;
}
function setLastClassifierRequests(requests) {
  STATE.lastClassifierRequests = requests;
}
function getLastClassifierRequests() {
  return STATE.lastClassifierRequests;
}
function setCachedClaudeMdContent(content) {
  STATE.cachedClaudeMdContent = content;
}
function getCachedClaudeMdContent() {
  return STATE.cachedClaudeMdContent;
}
function addToInMemoryErrorLog(errorInfo) {
  const MAX_IN_MEMORY_ERRORS = 100;
  if (STATE.inMemoryErrorLog.length >= MAX_IN_MEMORY_ERRORS) {
    STATE.inMemoryErrorLog.shift();
  }
  STATE.inMemoryErrorLog.push(errorInfo);
}
function getAllowedSettingSources() {
  return STATE.allowedSettingSources;
}
function setAllowedSettingSources(sources) {
  STATE.allowedSettingSources = sources;
}
function preferThirdPartyAuthentication() {
  return getIsNonInteractiveSession() && STATE.clientType !== "claude-vscode";
}
function setInlinePlugins(plugins) {
  STATE.inlinePlugins = plugins;
}
function getInlinePlugins() {
  return STATE.inlinePlugins;
}
function setChromeFlagOverride(value) {
  STATE.chromeFlagOverride = value;
}
function getChromeFlagOverride() {
  return STATE.chromeFlagOverride;
}
function setUseCoworkPlugins(value) {
  STATE.useCoworkPlugins = value;
  resetSettingsCache();
}
function getUseCoworkPlugins() {
  return STATE.useCoworkPlugins;
}
function setSessionBypassPermissionsMode(enabled) {
  STATE.sessionBypassPermissionsMode = enabled;
}
function getSessionBypassPermissionsMode() {
  return STATE.sessionBypassPermissionsMode;
}
function setScheduledTasksEnabled(enabled) {
  STATE.scheduledTasksEnabled = enabled;
}
function getScheduledTasksEnabled() {
  return STATE.scheduledTasksEnabled;
}
function getSessionCronTasks() {
  return STATE.sessionCronTasks;
}
function addSessionCronTask(task) {
  STATE.sessionCronTasks.push(task);
}
function removeSessionCronTasks(ids) {
  if (ids.length === 0) return 0;
  const idSet = new Set(ids);
  const remaining = STATE.sessionCronTasks.filter((t) => !idSet.has(t.id));
  const removed = STATE.sessionCronTasks.length - remaining.length;
  if (removed === 0) return 0;
  STATE.sessionCronTasks = remaining;
  return removed;
}
function setSessionTrustAccepted(accepted) {
  STATE.sessionTrustAccepted = accepted;
}
function getSessionTrustAccepted() {
  return STATE.sessionTrustAccepted;
}
function setSessionPersistenceDisabled(disabled) {
  STATE.sessionPersistenceDisabled = disabled;
}
function isSessionPersistenceDisabled() {
  return STATE.sessionPersistenceDisabled;
}
function hasExitedPlanModeInSession() {
  return STATE.hasExitedPlanMode;
}
function setHasExitedPlanMode(value) {
  STATE.hasExitedPlanMode = value;
}
function needsPlanModeExitAttachment() {
  return STATE.needsPlanModeExitAttachment;
}
function setNeedsPlanModeExitAttachment(value) {
  STATE.needsPlanModeExitAttachment = value;
}
function handlePlanModeTransition(fromMode, toMode) {
  if (toMode === "plan" && fromMode !== "plan") {
    STATE.needsPlanModeExitAttachment = false;
  }
  if (fromMode === "plan" && toMode !== "plan") {
    STATE.needsPlanModeExitAttachment = true;
  }
}
function needsAutoModeExitAttachment() {
  return STATE.needsAutoModeExitAttachment;
}
function setNeedsAutoModeExitAttachment(value) {
  STATE.needsAutoModeExitAttachment = value;
}
function handleAutoModeTransition(fromMode, toMode) {
  if (fromMode === "auto" && toMode === "plan" || fromMode === "plan" && toMode === "auto") {
    return;
  }
  const fromIsAuto = fromMode === "auto";
  const toIsAuto = toMode === "auto";
  if (toIsAuto && !fromIsAuto) {
    STATE.needsAutoModeExitAttachment = false;
  }
  if (fromIsAuto && !toIsAuto) {
    STATE.needsAutoModeExitAttachment = true;
  }
}
function hasShownLspRecommendationThisSession() {
  return STATE.lspRecommendationShownThisSession;
}
function setLspRecommendationShownThisSession(value) {
  STATE.lspRecommendationShownThisSession = value;
}
function setInitJsonSchema(schema) {
  STATE.initJsonSchema = schema;
}
function getInitJsonSchema() {
  return STATE.initJsonSchema;
}
function registerHookCallbacks(hooks) {
  if (!STATE.registeredHooks) {
    STATE.registeredHooks = {};
  }
  for (const [event, matchers] of Object.entries(hooks)) {
    const eventKey = event;
    if (!STATE.registeredHooks[eventKey]) {
      STATE.registeredHooks[eventKey] = [];
    }
    STATE.registeredHooks[eventKey].push(...matchers);
  }
}
function getRegisteredHooks() {
  return STATE.registeredHooks;
}
function clearRegisteredHooks() {
  STATE.registeredHooks = null;
}
function clearRegisteredPluginHooks() {
  if (!STATE.registeredHooks) {
    return;
  }
  const filtered = {};
  for (const [event, matchers] of Object.entries(STATE.registeredHooks)) {
    const callbackHooks = matchers.filter((m) => !("pluginRoot" in m));
    if (callbackHooks.length > 0) {
      filtered[event] = callbackHooks;
    }
  }
  STATE.registeredHooks = Object.keys(filtered).length > 0 ? filtered : null;
}
function resetSdkInitState() {
  STATE.initJsonSchema = null;
  STATE.registeredHooks = null;
}
function getPlanSlugCache() {
  return STATE.planSlugCache;
}
function getSessionCreatedTeams() {
  return STATE.sessionCreatedTeams;
}
function setTeleportedSessionInfo(info) {
  STATE.teleportedSessionInfo = {
    isTeleported: true,
    hasLoggedFirstMessage: false,
    sessionId: info.sessionId
  };
}
function getTeleportedSessionInfo() {
  return STATE.teleportedSessionInfo;
}
function markFirstTeleportMessageLogged() {
  if (STATE.teleportedSessionInfo) {
    STATE.teleportedSessionInfo.hasLoggedFirstMessage = true;
  }
}
function addInvokedSkill(skillName, skillPath, content, agentId = null) {
  const key = `${agentId ?? ""}:${skillName}`;
  STATE.invokedSkills.set(key, {
    skillName,
    skillPath,
    content,
    invokedAt: Date.now(),
    agentId
  });
}
function getInvokedSkills() {
  return STATE.invokedSkills;
}
function getInvokedSkillsForAgent(agentId) {
  const normalizedId = agentId ?? null;
  const filtered = /* @__PURE__ */ new Map();
  for (const [key, skill] of STATE.invokedSkills) {
    if (skill.agentId === normalizedId) {
      filtered.set(key, skill);
    }
  }
  return filtered;
}
function clearInvokedSkills(preservedAgentIds) {
  if (!preservedAgentIds || preservedAgentIds.size === 0) {
    STATE.invokedSkills.clear();
    return;
  }
  for (const [key, skill] of STATE.invokedSkills) {
    if (skill.agentId === null || !preservedAgentIds.has(skill.agentId)) {
      STATE.invokedSkills.delete(key);
    }
  }
}
function clearInvokedSkillsForAgent(agentId) {
  for (const [key, skill] of STATE.invokedSkills) {
    if (skill.agentId === agentId) {
      STATE.invokedSkills.delete(key);
    }
  }
}
const MAX_SLOW_OPERATIONS = 10;
const SLOW_OPERATION_TTL_MS = 1e4;
function addSlowOperation(operation, durationMs) {
  if (process.env.USER_TYPE !== "ant") return;
  if (operation.includes("exec") && operation.includes("claude-prompt-")) {
    return;
  }
  const now = Date.now();
  STATE.slowOperations = STATE.slowOperations.filter(
    (op) => now - op.timestamp < SLOW_OPERATION_TTL_MS
  );
  STATE.slowOperations.push({ operation, durationMs, timestamp: now });
  if (STATE.slowOperations.length > MAX_SLOW_OPERATIONS) {
    STATE.slowOperations = STATE.slowOperations.slice(-MAX_SLOW_OPERATIONS);
  }
}
const EMPTY_SLOW_OPERATIONS = [];
function getSlowOperations() {
  if (STATE.slowOperations.length === 0) {
    return EMPTY_SLOW_OPERATIONS;
  }
  const now = Date.now();
  if (STATE.slowOperations.some((op) => now - op.timestamp >= SLOW_OPERATION_TTL_MS)) {
    STATE.slowOperations = STATE.slowOperations.filter(
      (op) => now - op.timestamp < SLOW_OPERATION_TTL_MS
    );
    if (STATE.slowOperations.length === 0) {
      return EMPTY_SLOW_OPERATIONS;
    }
  }
  return STATE.slowOperations;
}
function getMainThreadAgentType() {
  return STATE.mainThreadAgentType;
}
function setMainThreadAgentType(agentType) {
  STATE.mainThreadAgentType = agentType;
}
function getIsRemoteMode() {
  return STATE.isRemoteMode;
}
function setIsRemoteMode(value) {
  STATE.isRemoteMode = value;
}
function getSystemPromptSectionCache() {
  return STATE.systemPromptSectionCache;
}
function setSystemPromptSectionCacheEntry(name, value) {
  STATE.systemPromptSectionCache.set(name, value);
}
function clearSystemPromptSectionState() {
  STATE.systemPromptSectionCache.clear();
}
function getLastEmittedDate() {
  return STATE.lastEmittedDate;
}
function setLastEmittedDate(date) {
  STATE.lastEmittedDate = date;
}
function getAdditionalDirectoriesForClaudeMd() {
  return STATE.additionalDirectoriesForClaudeMd;
}
function setAdditionalDirectoriesForClaudeMd(directories) {
  STATE.additionalDirectoriesForClaudeMd = directories;
}
function getAllowedChannels() {
  return STATE.allowedChannels;
}
function setAllowedChannels(entries) {
  STATE.allowedChannels = entries;
}
function getHasDevChannels() {
  return STATE.hasDevChannels;
}
function setHasDevChannels(value) {
  STATE.hasDevChannels = value;
}
function getPromptCache1hAllowlist() {
  return STATE.promptCache1hAllowlist;
}
function setPromptCache1hAllowlist(allowlist) {
  STATE.promptCache1hAllowlist = allowlist;
}
function getPromptCache1hEligible() {
  return STATE.promptCache1hEligible;
}
function setPromptCache1hEligible(eligible) {
  STATE.promptCache1hEligible = eligible;
}
function getAfkModeHeaderLatched() {
  return STATE.afkModeHeaderLatched;
}
function setAfkModeHeaderLatched(v) {
  STATE.afkModeHeaderLatched = v;
}
function getFastModeHeaderLatched() {
  return STATE.fastModeHeaderLatched;
}
function setFastModeHeaderLatched(v) {
  STATE.fastModeHeaderLatched = v;
}
function getCacheEditingHeaderLatched() {
  return STATE.cacheEditingHeaderLatched;
}
function setCacheEditingHeaderLatched(v) {
  STATE.cacheEditingHeaderLatched = v;
}
function getThinkingClearLatched() {
  return STATE.thinkingClearLatched;
}
function setThinkingClearLatched(v) {
  STATE.thinkingClearLatched = v;
}
function clearBetaHeaderLatches() {
  STATE.afkModeHeaderLatched = null;
  STATE.fastModeHeaderLatched = null;
  STATE.cacheEditingHeaderLatched = null;
  STATE.thinkingClearLatched = null;
}
function getPromptId() {
  return STATE.promptId;
}
function setPromptId(id) {
  STATE.promptId = id;
}
export {
  addInvokedSkill,
  addSessionCronTask,
  addSlowOperation,
  addToInMemoryErrorLog,
  addToToolDuration,
  addToTotalCostState,
  addToTotalDurationState,
  addToTotalLinesChanged,
  addToTurnClassifierDuration,
  addToTurnHookDuration,
  clearBetaHeaderLatches,
  clearInvokedSkills,
  clearInvokedSkillsForAgent,
  clearRegisteredHooks,
  clearRegisteredPluginHooks,
  clearSystemPromptSectionState,
  consumePostCompaction,
  flushInteractionTime,
  getActiveTimeCounter,
  getAdditionalDirectoriesForClaudeMd,
  getAfkModeHeaderLatched,
  getAgentColorMap,
  getAllowedChannels,
  getAllowedSettingSources,
  getApiKeyFromFd,
  getBudgetContinuationCount,
  getCacheEditingHeaderLatched,
  getCachedClaudeMdContent,
  getChromeFlagOverride,
  getClientType,
  getCodeEditToolDecisionCounter,
  getCommitCounter,
  getCostCounter,
  getCurrentTurnTokenBudget,
  getCwdState,
  getDirectConnectServerUrl,
  getEventLogger,
  getFastModeHeaderLatched,
  getFlagSettingsInline,
  getFlagSettingsPath,
  getHasDevChannels,
  getInitJsonSchema,
  getInitialMainLoopModel,
  getInlinePlugins,
  getInvokedSkills,
  getInvokedSkillsForAgent,
  getIsInteractive,
  getIsNonInteractiveSession,
  getIsRemoteMode,
  getIsScrollDraining,
  getKairosActive,
  getLastAPIRequest,
  getLastAPIRequestMessages,
  getLastApiCompletionTimestamp,
  getLastClassifierRequests,
  getLastEmittedDate,
  getLastInteractionTime,
  getLastMainRequestId,
  getLocCounter,
  getLoggerProvider,
  getMainLoopModelOverride,
  getMainThreadAgentType,
  getMeter,
  getMeterProvider,
  getModelStrings,
  getModelUsage,
  getOauthTokenFromFd,
  getOriginalCwd,
  getParentSessionId,
  getPlanSlugCache,
  getPrCounter,
  getProjectRoot,
  getPromptCache1hAllowlist,
  getPromptCache1hEligible,
  getPromptId,
  getQuestionPreviewFormat,
  getRegisteredHooks,
  getScheduledTasksEnabled,
  getSdkAgentProgressSummariesEnabled,
  getSdkBetas,
  getSessionBypassPermissionsMode,
  getSessionCounter,
  getSessionCreatedTeams,
  getSessionCronTasks,
  getSessionId,
  getSessionIngressToken,
  getSessionProjectDir,
  getSessionSource,
  getSessionTrustAccepted,
  getSlowOperations,
  getStatsStore,
  getStrictToolResultPairing,
  getSystemPromptSectionCache,
  getTeleportedSessionInfo,
  getThinkingClearLatched,
  getTokenCounter,
  getTotalAPIDuration,
  getTotalAPIDurationWithoutRetries,
  getTotalCacheCreationInputTokens,
  getTotalCacheReadInputTokens,
  getTotalCostUSD,
  getTotalDuration,
  getTotalInputTokens,
  getTotalLinesAdded,
  getTotalLinesRemoved,
  getTotalOutputTokens,
  getTotalToolDuration,
  getTotalWebSearchRequests,
  getTracerProvider,
  getTurnClassifierCount,
  getTurnClassifierDurationMs,
  getTurnHookCount,
  getTurnHookDurationMs,
  getTurnOutputTokens,
  getTurnToolCount,
  getTurnToolDurationMs,
  getUsageForModel,
  getUseCoworkPlugins,
  getUserMsgOptIn,
  handleAutoModeTransition,
  handlePlanModeTransition,
  hasExitedPlanModeInSession,
  hasShownLspRecommendationThisSession,
  hasUnknownModelCost,
  incrementBudgetContinuationCount,
  isReplBridgeActive,
  isSessionPersistenceDisabled,
  markFirstTeleportMessageLogged,
  markPostCompaction,
  markScrollActivity,
  needsAutoModeExitAttachment,
  needsPlanModeExitAttachment,
  onSessionSwitch,
  preferThirdPartyAuthentication,
  regenerateSessionId,
  registerHookCallbacks,
  removeSessionCronTasks,
  resetCostState,
  resetModelStringsForTestingOnly,
  resetSdkInitState,
  resetStateForTests,
  resetTotalDurationStateAndCost_FOR_TESTS_ONLY,
  resetTurnClassifierDuration,
  resetTurnHookDuration,
  resetTurnToolDuration,
  setAdditionalDirectoriesForClaudeMd,
  setAfkModeHeaderLatched,
  setAllowedChannels,
  setAllowedSettingSources,
  setApiKeyFromFd,
  setCacheEditingHeaderLatched,
  setCachedClaudeMdContent,
  setChromeFlagOverride,
  setClientType,
  setCostStateForRestore,
  setCwdState,
  setDirectConnectServerUrl,
  setEventLogger,
  setFastModeHeaderLatched,
  setFlagSettingsInline,
  setFlagSettingsPath,
  setHasDevChannels,
  setHasExitedPlanMode,
  setHasUnknownModelCost,
  setInitJsonSchema,
  setInitialMainLoopModel,
  setInlinePlugins,
  setIsInteractive,
  setIsRemoteMode,
  setKairosActive,
  setLastAPIRequest,
  setLastAPIRequestMessages,
  setLastApiCompletionTimestamp,
  setLastClassifierRequests,
  setLastEmittedDate,
  setLastMainRequestId,
  setLoggerProvider,
  setLspRecommendationShownThisSession,
  setMainLoopModelOverride,
  setMainThreadAgentType,
  setMeter,
  setMeterProvider,
  setModelStrings,
  setNeedsAutoModeExitAttachment,
  setNeedsPlanModeExitAttachment,
  setOauthTokenFromFd,
  setOriginalCwd,
  setProjectRoot,
  setPromptCache1hAllowlist,
  setPromptCache1hEligible,
  setPromptId,
  setQuestionPreviewFormat,
  setScheduledTasksEnabled,
  setSdkAgentProgressSummariesEnabled,
  setSdkBetas,
  setSessionBypassPermissionsMode,
  setSessionIngressToken,
  setSessionPersistenceDisabled,
  setSessionSource,
  setSessionTrustAccepted,
  setStatsStore,
  setStrictToolResultPairing,
  setSystemPromptSectionCacheEntry,
  setTeleportedSessionInfo,
  setThinkingClearLatched,
  setTracerProvider,
  setUseCoworkPlugins,
  setUserMsgOptIn,
  snapshotOutputTokensForTurn,
  switchSession,
  updateLastInteractionTime,
  waitForScrollIdle
};
