import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { Box, Text } from "../ink.js";
import { getLargeMemoryFiles, MAX_MEMORY_CHARACTER_COUNT } from "./claudemd.js";
import figures from "figures";
import { getCwd } from "./cwd.js";
import { relative } from "path";
import { formatNumber } from "./format.js";
import { getAnthropicApiKeyWithSource, getApiKeyFromConfigOrMacOSKeychain, getAuthTokenSource, isClaudeAISubscriber } from "./auth.js";
import { getAgentDescriptionsTotalTokens, AGENT_DESCRIPTIONS_THRESHOLD } from "./statusNoticeHelpers.js";
import { isSupportedJetBrainsTerminal, toIDEDisplayName, getTerminalIdeType } from "./ide.js";
import { isJetBrainsPluginInstalledCachedSync } from "./jetbrains.js";
const largeMemoryFilesNotice = {
  id: "large-memory-files",
  type: "warning",
  isActive: (ctx) => getLargeMemoryFiles(ctx.memoryFiles).length > 0,
  render: (ctx) => {
    const largeMemoryFiles = getLargeMemoryFiles(ctx.memoryFiles);
    return /* @__PURE__ */ jsx(Fragment, { children: largeMemoryFiles.map((file) => {
      const displayPath = file.path.startsWith(getCwd()) ? relative(getCwd(), file.path) : file.path;
      return /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
        /* @__PURE__ */ jsx(Text, { color: "warning", children: figures.warning }),
        /* @__PURE__ */ jsxs(Text, { color: "warning", children: [
          "Large ",
          /* @__PURE__ */ jsx(Text, { bold: true, children: displayPath }),
          " will impact performance (",
          formatNumber(file.content.length),
          " chars >",
          " ",
          formatNumber(MAX_MEMORY_CHARACTER_COUNT),
          ")",
          /* @__PURE__ */ jsx(Text, { dimColor: true, children: " \xB7 /memory to edit" })
        ] })
      ] }, file.path);
    }) });
  }
};
const claudeAiSubscriberExternalTokenNotice = {
  id: "claude-ai-external-token",
  type: "warning",
  isActive: () => {
    const authTokenInfo = getAuthTokenSource();
    return isClaudeAISubscriber() && (authTokenInfo.source === "ANTHROPIC_AUTH_TOKEN" || authTokenInfo.source === "apiKeyHelper");
  },
  render: () => {
    const authTokenInfo = getAuthTokenSource();
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "row", marginTop: 1, children: [
      /* @__PURE__ */ jsx(Text, { color: "warning", children: figures.warning }),
      /* @__PURE__ */ jsxs(Text, { color: "warning", children: [
        "Auth conflict: Using ",
        authTokenInfo.source,
        " instead of Claude account subscription token. Either unset ",
        authTokenInfo.source,
        ", or run `claude /logout`."
      ] })
    ] });
  }
};
const apiKeyConflictNotice = {
  id: "api-key-conflict",
  type: "warning",
  isActive: () => {
    const {
      source: apiKeySource
    } = getAnthropicApiKeyWithSource({
      skipRetrievingKeyFromApiKeyHelper: true
    });
    return !!getApiKeyFromConfigOrMacOSKeychain() && (apiKeySource === "ANTHROPIC_API_KEY" || apiKeySource === "apiKeyHelper");
  },
  render: () => {
    const {
      source: apiKeySource
    } = getAnthropicApiKeyWithSource({
      skipRetrievingKeyFromApiKeyHelper: true
    });
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "row", marginTop: 1, children: [
      /* @__PURE__ */ jsx(Text, { color: "warning", children: figures.warning }),
      /* @__PURE__ */ jsxs(Text, { color: "warning", children: [
        "Auth conflict: Using ",
        apiKeySource,
        " instead of Anthropic Console key. Either unset ",
        apiKeySource,
        ", or run `claude /logout`."
      ] })
    ] });
  }
};
const bothAuthMethodsNotice = {
  id: "both-auth-methods",
  type: "warning",
  isActive: () => {
    const {
      source: apiKeySource
    } = getAnthropicApiKeyWithSource({
      skipRetrievingKeyFromApiKeyHelper: true
    });
    const authTokenInfo = getAuthTokenSource();
    return apiKeySource !== "none" && authTokenInfo.source !== "none" && !(apiKeySource === "apiKeyHelper" && authTokenInfo.source === "apiKeyHelper");
  },
  render: () => {
    const {
      source: apiKeySource
    } = getAnthropicApiKeyWithSource({
      skipRetrievingKeyFromApiKeyHelper: true
    });
    const authTokenInfo = getAuthTokenSource();
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
      /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
        /* @__PURE__ */ jsx(Text, { color: "warning", children: figures.warning }),
        /* @__PURE__ */ jsxs(Text, { color: "warning", children: [
          "Auth conflict: Both a token (",
          authTokenInfo.source,
          ") and an API key (",
          apiKeySource,
          ") are set. This may lead to unexpected behavior."
        ] })
      ] }),
      /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginLeft: 3, children: [
        /* @__PURE__ */ jsxs(Text, { color: "warning", children: [
          "\xB7 Trying to use",
          " ",
          authTokenInfo.source === "claude.ai" ? "claude.ai" : authTokenInfo.source,
          "?",
          " ",
          apiKeySource === "ANTHROPIC_API_KEY" ? 'Unset the ANTHROPIC_API_KEY environment variable, or claude /logout then say "No" to the API key approval before login.' : apiKeySource === "apiKeyHelper" ? "Unset the apiKeyHelper setting." : "claude /logout"
        ] }),
        /* @__PURE__ */ jsxs(Text, { color: "warning", children: [
          "\xB7 Trying to use ",
          apiKeySource,
          "?",
          " ",
          authTokenInfo.source === "claude.ai" ? "claude /logout to sign out of claude.ai." : `Unset the ${authTokenInfo.source} environment variable.`
        ] })
      ] })
    ] });
  }
};
const largeAgentDescriptionsNotice = {
  id: "large-agent-descriptions",
  type: "warning",
  isActive: (context) => {
    const totalTokens = getAgentDescriptionsTotalTokens(context.agentDefinitions);
    return totalTokens > AGENT_DESCRIPTIONS_THRESHOLD;
  },
  render: (context) => {
    const totalTokens = getAgentDescriptionsTotalTokens(context.agentDefinitions);
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
      /* @__PURE__ */ jsx(Text, { color: "warning", children: figures.warning }),
      /* @__PURE__ */ jsxs(Text, { color: "warning", children: [
        "Large cumulative agent descriptions will impact performance (~",
        formatNumber(totalTokens),
        " tokens >",
        " ",
        formatNumber(AGENT_DESCRIPTIONS_THRESHOLD),
        ")",
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: " \xB7 /agents to manage" })
      ] })
    ] });
  }
};
const jetbrainsPluginNotice = {
  id: "jetbrains-plugin-install",
  type: "info",
  isActive: (context) => {
    if (!isSupportedJetBrainsTerminal()) {
      return false;
    }
    const shouldAutoInstall = context.config.autoInstallIdeExtension ?? true;
    if (!shouldAutoInstall) {
      return false;
    }
    const ideType = getTerminalIdeType();
    return ideType !== null && !isJetBrainsPluginInstalledCachedSync(ideType);
  },
  render: () => {
    const ideType = getTerminalIdeType();
    const ideName = toIDEDisplayName(ideType);
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 1, marginLeft: 1, children: [
      /* @__PURE__ */ jsx(Text, { color: "ide", children: figures.arrowUp }),
      /* @__PURE__ */ jsxs(Text, { children: [
        "Install the ",
        /* @__PURE__ */ jsx(Text, { color: "ide", children: ideName }),
        " plugin from the JetBrains Marketplace:",
        " ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: "https://docs.claude.com/s/claude-code-jetbrains" })
      ] })
    ] });
  }
};
const statusNoticeDefinitions = [largeMemoryFilesNotice, largeAgentDescriptionsNotice, claudeAiSubscriberExternalTokenNotice, apiKeyConflictNotice, bothAuthMethodsNotice, jetbrainsPluginNotice];
function getActiveNotices(context) {
  return statusNoticeDefinitions.filter((notice) => notice.isActive(context));
}
export {
  getActiveNotices,
  statusNoticeDefinitions
};
