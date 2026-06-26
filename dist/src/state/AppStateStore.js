import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
import { shouldEnablePromptSuggestion } from "../services/PromptSuggestion/promptSuggestion.js";
import {
  getEmptyToolPermissionContext
} from "../Tool.js";
import {
  createEmptyAttributionState
} from "../utils/commitAttribution.js";
import { getInitialSettings } from "../utils/settings/settings.js";
import { shouldEnableThinkingByDefault } from "../utils/thinking.js";
const IDLE_SPECULATION_STATE = { status: "idle" };
function getDefaultAppState() {
  const teammateUtils = require2("../utils/teammate.js");
  const initialMode = teammateUtils.isTeammate() && teammateUtils.isPlanModeRequired() ? "plan" : "default";
  return {
    settings: getInitialSettings(),
    tasks: {},
    agentNameRegistry: /* @__PURE__ */ new Map(),
    verbose: false,
    mainLoopModel: null,
    // alias, full name (as with --model or env var), or null (default)
    mainLoopModelForSession: null,
    statusLineText: void 0,
    expandedView: "none",
    isBriefOnly: false,
    showTeammateMessagePreview: false,
    selectedIPAgentIndex: -1,
    coordinatorTaskIndex: -1,
    viewSelectionMode: "none",
    footerSelection: null,
    kairosEnabled: false,
    remoteSessionUrl: void 0,
    remoteConnectionStatus: "connecting",
    remoteBackgroundTaskCount: 0,
    replBridgeEnabled: false,
    replBridgeExplicit: false,
    replBridgeOutboundOnly: false,
    replBridgeConnected: false,
    replBridgeSessionActive: false,
    replBridgeReconnecting: false,
    replBridgeConnectUrl: void 0,
    replBridgeSessionUrl: void 0,
    replBridgeEnvironmentId: void 0,
    replBridgeSessionId: void 0,
    replBridgeError: void 0,
    replBridgeInitialName: void 0,
    showRemoteCallout: false,
    toolPermissionContext: {
      ...getEmptyToolPermissionContext(),
      mode: initialMode
    },
    agent: void 0,
    agentDefinitions: { activeAgents: [], allAgents: [] },
    fileHistory: {
      snapshots: [],
      trackedFiles: /* @__PURE__ */ new Set(),
      snapshotSequence: 0
    },
    attribution: createEmptyAttributionState(),
    mcp: {
      clients: [],
      tools: [],
      commands: [],
      resources: {},
      pluginReconnectKey: 0
    },
    plugins: {
      enabled: [],
      disabled: [],
      commands: [],
      errors: [],
      installationStatus: {
        marketplaces: [],
        plugins: []
      },
      needsRefresh: false
    },
    todos: {},
    remoteAgentTaskSuggestions: [],
    notifications: {
      current: null,
      queue: []
    },
    elicitation: {
      queue: []
    },
    thinkingEnabled: shouldEnableThinkingByDefault(),
    promptSuggestionEnabled: shouldEnablePromptSuggestion(),
    sessionHooks: /* @__PURE__ */ new Map(),
    inbox: {
      messages: []
    },
    workerSandboxPermissions: {
      queue: [],
      selectedIndex: 0
    },
    pendingWorkerRequest: null,
    pendingSandboxRequest: null,
    promptSuggestion: {
      text: null,
      promptId: null,
      shownAt: 0,
      acceptedAt: 0,
      generationRequestId: null
    },
    speculation: IDLE_SPECULATION_STATE,
    speculationSessionTimeSavedMs: 0,
    skillImprovement: {
      suggestion: null
    },
    authVersion: 0,
    initialMessage: null,
    effortValue: void 0,
    activeOverlays: /* @__PURE__ */ new Set(),
    fastMode: false
  };
}
export {
  IDLE_SPECULATION_STATE,
  getDefaultAppState
};
