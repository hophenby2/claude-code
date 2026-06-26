import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import figures from "figures";
import React, { useEffect, useRef, useState } from "react";
import { logEvent } from "../../services/analytics/index.js";
import { getOauthConfig } from "../../constants/oauth.js";
import { useExitOnCtrlCDWithKeybindings } from "../../hooks/useExitOnCtrlCDWithKeybindings.js";
import { useTerminalSize } from "../../hooks/useTerminalSize.js";
import { setClipboard } from "../../ink/termio/osc.js";
import { Box, color, Link, Text, useInput, useTheme } from "../../ink.js";
import { useKeybinding } from "../../keybindings/useKeybinding.js";
import { AuthenticationCancelledError, performMCPOAuthFlow, revokeServerTokens } from "../../services/mcp/auth.js";
import { clearServerCache } from "../../services/mcp/client.js";
import { useMcpReconnect, useMcpToggleEnabled } from "../../services/mcp/MCPConnectionManager.js";
import { describeMcpConfigFilePath, excludeCommandsByServer, excludeResourcesByServer, excludeToolsByServer, filterMcpPromptsByServer } from "../../services/mcp/utils.js";
import { useAppState, useSetAppState } from "../../state/AppState.js";
import { getOauthAccountInfo } from "../../utils/auth.js";
import { openBrowser } from "../../utils/browser.js";
import { errorMessage } from "../../utils/errors.js";
import { logMCPDebug } from "../../utils/log.js";
import { capitalize } from "../../utils/stringUtils.js";
import { ConfigurableShortcutHint } from "../ConfigurableShortcutHint.js";
import { Select } from "../CustomSelect/index.js";
import { Byline } from "../design-system/Byline.js";
import { KeyboardShortcutHint } from "../design-system/KeyboardShortcutHint.js";
import { Spinner } from "../Spinner.js";
import TextInput from "../TextInput.js";
import { CapabilitiesSection } from "./CapabilitiesSection.js";
import { handleReconnectError, handleReconnectResult } from "./utils/reconnectHelpers.js";
function MCPRemoteServerMenu({
  server,
  serverToolsCount,
  onViewTools,
  onCancel,
  onComplete,
  borderless = false
}) {
  const [theme] = useTheme();
  const exitState = useExitOnCtrlCDWithKeybindings();
  const {
    columns: terminalColumns
  } = useTerminalSize();
  const [isAuthenticating, setIsAuthenticating] = React.useState(false);
  const [error, setError] = React.useState(null);
  const mcp = useAppState((s) => s.mcp);
  const setAppState = useSetAppState();
  const [authorizationUrl, setAuthorizationUrl] = React.useState(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const authAbortControllerRef = useRef(null);
  const [isClaudeAIAuthenticating, setIsClaudeAIAuthenticating] = useState(false);
  const [claudeAIAuthUrl, setClaudeAIAuthUrl] = useState(null);
  const [isClaudeAIClearingAuth, setIsClaudeAIClearingAuth] = useState(false);
  const [claudeAIClearAuthUrl, setClaudeAIClearAuthUrl] = useState(null);
  const [claudeAIClearAuthBrowserOpened, setClaudeAIClearAuthBrowserOpened] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const copyTimeoutRef = useRef(void 0);
  const unmountedRef = useRef(false);
  const [callbackUrlInput, setCallbackUrlInput] = useState("");
  const [callbackUrlCursorOffset, setCallbackUrlCursorOffset] = useState(0);
  const [manualCallbackSubmit, setManualCallbackSubmit] = useState(null);
  useEffect(() => () => {
    unmountedRef.current = true;
    authAbortControllerRef.current?.abort();
    if (copyTimeoutRef.current !== void 0) {
      clearTimeout(copyTimeoutRef.current);
    }
  }, []);
  const isEffectivelyAuthenticated = server.isAuthenticated || server.client.type === "connected" && serverToolsCount > 0;
  const reconnectMcpServer = useMcpReconnect();
  const handleClaudeAIAuthComplete = React.useCallback(async () => {
    setIsClaudeAIAuthenticating(false);
    setClaudeAIAuthUrl(null);
    setIsReconnecting(true);
    try {
      const result = await reconnectMcpServer(server.name);
      const success = result.client.type === "connected";
      logEvent("tengu_claudeai_mcp_auth_completed", {
        success
      });
      if (success) {
        onComplete?.(`Authentication successful. Connected to ${server.name}.`);
      } else if (result.client.type === "needs-auth") {
        onComplete?.("Authentication successful, but server still requires authentication. You may need to manually restart Claude Code.");
      } else {
        onComplete?.("Authentication successful, but server reconnection failed. You may need to manually restart Claude Code for the changes to take effect.");
      }
    } catch (err) {
      logEvent("tengu_claudeai_mcp_auth_completed", {
        success: false
      });
      onComplete?.(handleReconnectError(err, server.name));
    } finally {
      setIsReconnecting(false);
    }
  }, [reconnectMcpServer, server.name, onComplete]);
  const handleClaudeAIClearAuthComplete = React.useCallback(async () => {
    await clearServerCache(server.name, {
      ...server.config,
      scope: server.scope
    });
    setAppState((prev) => {
      const newClients = prev.mcp.clients.map((c) => c.name === server.name ? {
        ...c,
        type: "needs-auth"
      } : c);
      const newTools = excludeToolsByServer(prev.mcp.tools, server.name);
      const newCommands = excludeCommandsByServer(prev.mcp.commands, server.name);
      const newResources = excludeResourcesByServer(prev.mcp.resources, server.name);
      return {
        ...prev,
        mcp: {
          ...prev.mcp,
          clients: newClients,
          tools: newTools,
          commands: newCommands,
          resources: newResources
        }
      };
    });
    logEvent("tengu_claudeai_mcp_clear_auth_completed", {});
    onComplete?.(`Disconnected from ${server.name}.`);
    setIsClaudeAIClearingAuth(false);
    setClaudeAIClearAuthUrl(null);
    setClaudeAIClearAuthBrowserOpened(false);
  }, [server.name, server.config, server.scope, setAppState, onComplete]);
  useKeybinding("confirm:no", () => {
    authAbortControllerRef.current?.abort();
    authAbortControllerRef.current = null;
    setIsAuthenticating(false);
    setAuthorizationUrl(null);
  }, {
    context: "Confirmation",
    isActive: isAuthenticating
  });
  useKeybinding("confirm:no", () => {
    setIsClaudeAIAuthenticating(false);
    setClaudeAIAuthUrl(null);
  }, {
    context: "Confirmation",
    isActive: isClaudeAIAuthenticating
  });
  useKeybinding("confirm:no", () => {
    setIsClaudeAIClearingAuth(false);
    setClaudeAIClearAuthUrl(null);
    setClaudeAIClearAuthBrowserOpened(false);
  }, {
    context: "Confirmation",
    isActive: isClaudeAIClearingAuth
  });
  useInput((input, key) => {
    if (key.return && isClaudeAIAuthenticating) {
      void handleClaudeAIAuthComplete();
    }
    if (key.return && isClaudeAIClearingAuth) {
      if (claudeAIClearAuthBrowserOpened) {
        void handleClaudeAIClearAuthComplete();
      } else {
        const connectorsUrl = `${getOauthConfig().CLAUDE_AI_ORIGIN}/settings/connectors`;
        setClaudeAIClearAuthUrl(connectorsUrl);
        setClaudeAIClearAuthBrowserOpened(true);
        void openBrowser(connectorsUrl);
      }
    }
    if (input === "c" && !urlCopied) {
      const urlToCopy = authorizationUrl || claudeAIAuthUrl || claudeAIClearAuthUrl;
      if (urlToCopy) {
        void setClipboard(urlToCopy).then((raw) => {
          if (unmountedRef.current) return;
          if (raw) process.stdout.write(raw);
          setUrlCopied(true);
          if (copyTimeoutRef.current !== void 0) {
            clearTimeout(copyTimeoutRef.current);
          }
          copyTimeoutRef.current = setTimeout(setUrlCopied, 2e3, false);
        });
      }
    }
  });
  const capitalizedServerName = capitalize(String(server.name));
  const serverCommandsCount = filterMcpPromptsByServer(mcp.commands, server.name).length;
  const toggleMcpServer = useMcpToggleEnabled();
  const handleClaudeAIAuth = React.useCallback(async () => {
    const claudeAiBaseUrl = getOauthConfig().CLAUDE_AI_ORIGIN;
    const accountInfo = getOauthAccountInfo();
    const orgUuid = accountInfo?.organizationUuid;
    let authUrl;
    if (orgUuid && server.config.type === "claudeai-proxy" && server.config.id) {
      const serverId = server.config.id.startsWith("mcprs") ? "mcpsrv" + server.config.id.slice(5) : server.config.id;
      const productSurface = encodeURIComponent(process.env.CLAUDE_CODE_ENTRYPOINT || "cli");
      authUrl = `${claudeAiBaseUrl}/api/organizations/${orgUuid}/mcp/start-auth/${serverId}?product_surface=${productSurface}`;
    } else {
      authUrl = `${claudeAiBaseUrl}/settings/connectors`;
    }
    setClaudeAIAuthUrl(authUrl);
    setIsClaudeAIAuthenticating(true);
    logEvent("tengu_claudeai_mcp_auth_started", {});
    await openBrowser(authUrl);
  }, [server.config]);
  const handleClaudeAIClearAuth = React.useCallback(() => {
    setIsClaudeAIClearingAuth(true);
    logEvent("tengu_claudeai_mcp_clear_auth_started", {});
  }, []);
  const handleToggleEnabled = React.useCallback(async () => {
    const wasEnabled = server.client.type !== "disabled";
    try {
      await toggleMcpServer(server.name);
      if (server.config.type === "claudeai-proxy") {
        logEvent("tengu_claudeai_mcp_toggle", {
          new_state: wasEnabled ? "disabled" : "enabled"
        });
      }
      onCancel();
    } catch (err_0) {
      const action = wasEnabled ? "disable" : "enable";
      onComplete?.(`Failed to ${action} MCP server '${server.name}': ${errorMessage(err_0)}`);
    }
  }, [server.client.type, server.config.type, server.name, toggleMcpServer, onCancel, onComplete]);
  const handleAuthenticate = React.useCallback(async () => {
    if (server.config.type === "claudeai-proxy") return;
    setIsAuthenticating(true);
    setError(null);
    const controller = new AbortController();
    authAbortControllerRef.current = controller;
    try {
      if (server.isAuthenticated && server.config) {
        await revokeServerTokens(server.name, server.config, {
          preserveStepUpState: true
        });
      }
      if (server.config) {
        await performMCPOAuthFlow(server.name, server.config, setAuthorizationUrl, controller.signal, {
          onWaitingForCallback: (submit) => {
            setManualCallbackSubmit(() => submit);
          }
        });
        logEvent("tengu_mcp_auth_config_authenticate", {
          wasAuthenticated: server.isAuthenticated
        });
        const result_0 = await reconnectMcpServer(server.name);
        if (result_0.client.type === "connected") {
          const message = isEffectivelyAuthenticated ? `Authentication successful. Reconnected to ${server.name}.` : `Authentication successful. Connected to ${server.name}.`;
          onComplete?.(message);
        } else if (result_0.client.type === "needs-auth") {
          onComplete?.("Authentication successful, but server still requires authentication. You may need to manually restart Claude Code.");
        } else {
          logMCPDebug(server.name, `Reconnection failed after authentication`);
          onComplete?.("Authentication successful, but server reconnection failed. You may need to manually restart Claude Code for the changes to take effect.");
        }
      }
    } catch (err_1) {
      if (err_1 instanceof Error && !(err_1 instanceof AuthenticationCancelledError)) {
        setError(err_1.message);
      }
    } finally {
      setIsAuthenticating(false);
      authAbortControllerRef.current = null;
      setManualCallbackSubmit(null);
      setCallbackUrlInput("");
    }
  }, [server.isAuthenticated, server.config, server.name, onComplete, reconnectMcpServer, isEffectivelyAuthenticated]);
  const handleClearAuth = async () => {
    if (server.config.type === "claudeai-proxy") return;
    if (server.config) {
      await revokeServerTokens(server.name, server.config);
      logEvent("tengu_mcp_auth_config_clear", {});
      await clearServerCache(server.name, {
        ...server.config,
        scope: server.scope
      });
      setAppState((prev_0) => {
        const newClients_0 = prev_0.mcp.clients.map((c_0) => (
          // 'failed' is a misnomer here, but we don't really differentiate between "not connected" and "failed" at the moment
          c_0.name === server.name ? {
            ...c_0,
            type: "failed"
          } : c_0
        ));
        const newTools_0 = excludeToolsByServer(prev_0.mcp.tools, server.name);
        const newCommands_0 = excludeCommandsByServer(prev_0.mcp.commands, server.name);
        const newResources_0 = excludeResourcesByServer(prev_0.mcp.resources, server.name);
        return {
          ...prev_0,
          mcp: {
            ...prev_0.mcp,
            clients: newClients_0,
            tools: newTools_0,
            commands: newCommands_0,
            resources: newResources_0
          }
        };
      });
      onComplete?.(`Authentication cleared for ${server.name}.`);
    }
  };
  if (isAuthenticating) {
    const authCopy = server.config.type !== "claudeai-proxy" && server.config.oauth?.xaa ? " Authenticating via your identity provider" : " A browser window will open for authentication";
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, padding: 1, children: [
      /* @__PURE__ */ jsxs(Text, { color: "claude", children: [
        "Authenticating with ",
        server.name,
        "\u2026"
      ] }),
      /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Spinner, {}),
        /* @__PURE__ */ jsx(Text, { children: authCopy })
      ] }),
      authorizationUrl && /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
            "If your browser doesn't open automatically, copy this URL manually",
            " "
          ] }),
          urlCopied ? /* @__PURE__ */ jsx(Text, { color: "success", children: "(Copied!)" }) : /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "c", action: "copy", parens: true }) })
        ] }),
        /* @__PURE__ */ jsx(Link, { url: authorizationUrl })
      ] }),
      isAuthenticating && authorizationUrl && manualCallbackSubmit && /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "If the redirect page shows a connection error, paste the URL from your browser's address bar:" }),
        /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
            "URL ",
            ">",
            " "
          ] }),
          /* @__PURE__ */ jsx(TextInput, { value: callbackUrlInput, onChange: setCallbackUrlInput, onSubmit: (value) => {
            manualCallbackSubmit(value.trim());
            setCallbackUrlInput("");
          }, cursorOffset: callbackUrlCursorOffset, onChangeCursorOffset: setCallbackUrlCursorOffset, columns: terminalColumns - 8 })
        ] })
      ] }),
      /* @__PURE__ */ jsx(Box, { marginLeft: 3, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Return here after authenticating in your browser. Press Esc to go back." }) })
    ] });
  }
  if (isClaudeAIAuthenticating) {
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, padding: 1, children: [
      /* @__PURE__ */ jsxs(Text, { color: "claude", children: [
        "Authenticating with ",
        server.name,
        "\u2026"
      ] }),
      /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Spinner, {}),
        /* @__PURE__ */ jsx(Text, { children: " A browser window will open for authentication" })
      ] }),
      claudeAIAuthUrl && /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
            "If your browser doesn't open automatically, copy this URL manually",
            " "
          ] }),
          urlCopied ? /* @__PURE__ */ jsx(Text, { color: "success", children: "(Copied!)" }) : /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "c", action: "copy", parens: true }) })
        ] }),
        /* @__PURE__ */ jsx(Link, { url: claudeAIAuthUrl })
      ] }),
      /* @__PURE__ */ jsxs(Box, { marginLeft: 3, flexDirection: "column", children: [
        /* @__PURE__ */ jsxs(Text, { color: "permission", children: [
          "Press ",
          /* @__PURE__ */ jsx(Text, { bold: true, children: "Enter" }),
          " after authenticating in your browser."
        ] }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "back" }) })
      ] })
    ] });
  }
  if (isClaudeAIClearingAuth) {
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, padding: 1, children: [
      /* @__PURE__ */ jsxs(Text, { color: "claude", children: [
        "Clear authentication for ",
        server.name
      ] }),
      claudeAIClearAuthBrowserOpened ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Text, { children: 'Find the MCP server in the browser and click "Disconnect".' }),
        claudeAIClearAuthUrl && /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
          /* @__PURE__ */ jsxs(Box, { children: [
            /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
              "If your browser didn't open automatically, copy this URL manually",
              " "
            ] }),
            urlCopied ? /* @__PURE__ */ jsx(Text, { color: "success", children: "(Copied!)" }) : /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "c", action: "copy", parens: true }) })
          ] }),
          /* @__PURE__ */ jsx(Link, { url: claudeAIClearAuthUrl })
        ] }),
        /* @__PURE__ */ jsxs(Box, { marginLeft: 3, flexDirection: "column", children: [
          /* @__PURE__ */ jsxs(Text, { color: "permission", children: [
            "Press ",
            /* @__PURE__ */ jsx(Text, { bold: true, children: "Enter" }),
            " when done."
          ] }),
          /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "back" }) })
        ] })
      ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Text, { children: 'This will open claude.ai in the browser. Find the MCP server in the list and click "Disconnect".' }),
        /* @__PURE__ */ jsxs(Box, { marginLeft: 3, flexDirection: "column", children: [
          /* @__PURE__ */ jsxs(Text, { color: "permission", children: [
            "Press ",
            /* @__PURE__ */ jsx(Text, { bold: true, children: "Enter" }),
            " to open the browser."
          ] }),
          /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "back" }) })
        ] })
      ] })
    ] });
  }
  if (isReconnecting) {
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, padding: 1, children: [
      /* @__PURE__ */ jsxs(Text, { color: "text", children: [
        "Connecting to ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: server.name }),
        "\u2026"
      ] }),
      /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Spinner, {}),
        /* @__PURE__ */ jsx(Text, { children: " Establishing connection to MCP server" })
      ] }),
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: "This may take a few moments." })
    ] });
  }
  const menuOptions = [];
  if (server.client.type === "disabled") {
    menuOptions.push({
      label: "Enable",
      value: "toggle-enabled"
    });
  }
  if (server.client.type === "connected" && serverToolsCount > 0) {
    menuOptions.push({
      label: "View tools",
      value: "tools"
    });
  }
  if (server.config.type === "claudeai-proxy") {
    if (server.client.type === "connected") {
      menuOptions.push({
        label: "Clear authentication",
        value: "claudeai-clear-auth"
      });
    } else if (server.client.type !== "disabled") {
      menuOptions.push({
        label: "Authenticate",
        value: "claudeai-auth"
      });
    }
  } else {
    if (isEffectivelyAuthenticated) {
      menuOptions.push({
        label: "Re-authenticate",
        value: "reauth"
      });
      menuOptions.push({
        label: "Clear authentication",
        value: "clear-auth"
      });
    }
    if (!isEffectivelyAuthenticated) {
      menuOptions.push({
        label: "Authenticate",
        value: "auth"
      });
    }
  }
  if (server.client.type !== "disabled") {
    if (server.client.type !== "needs-auth") {
      menuOptions.push({
        label: "Reconnect",
        value: "reconnectMcpServer"
      });
    }
    menuOptions.push({
      label: "Disable",
      value: "toggle-enabled"
    });
  }
  if (menuOptions.length === 0) {
    menuOptions.push({
      label: "Back",
      value: "back"
    });
  }
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    /* @__PURE__ */ jsxs(Box, { flexDirection: "column", paddingX: 1, borderStyle: borderless ? void 0 : "round", children: [
      /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsxs(Text, { bold: true, children: [
        capitalizedServerName,
        " MCP Server"
      ] }) }),
      /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 0, children: [
        /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Text, { bold: true, children: "Status: " }),
          server.client.type === "disabled" ? /* @__PURE__ */ jsxs(Text, { children: [
            color("inactive", theme)(figures.radioOff),
            " disabled"
          ] }) : server.client.type === "connected" ? /* @__PURE__ */ jsxs(Text, { children: [
            color("success", theme)(figures.tick),
            " connected"
          ] }) : server.client.type === "pending" ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(Text, { dimColor: true, children: figures.radioOff }),
            /* @__PURE__ */ jsx(Text, { children: " connecting\u2026" })
          ] }) : server.client.type === "needs-auth" ? /* @__PURE__ */ jsxs(Text, { children: [
            color("warning", theme)(figures.triangleUpOutline),
            " needs authentication"
          ] }) : /* @__PURE__ */ jsxs(Text, { children: [
            color("error", theme)(figures.cross),
            " failed"
          ] })
        ] }),
        server.transport !== "claudeai-proxy" && /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Text, { bold: true, children: "Auth: " }),
          isEffectivelyAuthenticated ? /* @__PURE__ */ jsxs(Text, { children: [
            color("success", theme)(figures.tick),
            " authenticated"
          ] }) : /* @__PURE__ */ jsxs(Text, { children: [
            color("error", theme)(figures.cross),
            " not authenticated"
          ] })
        ] }),
        /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Text, { bold: true, children: "URL: " }),
          /* @__PURE__ */ jsx(Text, { dimColor: true, children: server.config.url })
        ] }),
        /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Text, { bold: true, children: "Config location: " }),
          /* @__PURE__ */ jsx(Text, { dimColor: true, children: describeMcpConfigFilePath(server.scope) })
        ] }),
        server.client.type === "connected" && /* @__PURE__ */ jsx(CapabilitiesSection, { serverToolsCount, serverPromptsCount: serverCommandsCount, serverResourcesCount: mcp.resources[server.name]?.length || 0 }),
        server.client.type === "connected" && serverToolsCount > 0 && /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Text, { bold: true, children: "Tools: " }),
          /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
            serverToolsCount,
            " tools"
          ] })
        ] })
      ] }),
      error && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { color: "error", children: [
        "Error: ",
        error
      ] }) }),
      menuOptions.length > 0 && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Select, { options: menuOptions, onChange: async (value_0) => {
        switch (value_0) {
          case "tools":
            onViewTools();
            break;
          case "auth":
          case "reauth":
            await handleAuthenticate();
            break;
          case "clear-auth":
            await handleClearAuth();
            break;
          case "claudeai-auth":
            await handleClaudeAIAuth();
            break;
          case "claudeai-clear-auth":
            handleClaudeAIClearAuth();
            break;
          case "reconnectMcpServer":
            setIsReconnecting(true);
            try {
              const result_1 = await reconnectMcpServer(server.name);
              if (server.config.type === "claudeai-proxy") {
                logEvent("tengu_claudeai_mcp_reconnect", {
                  success: result_1.client.type === "connected"
                });
              }
              const {
                message: message_0
              } = handleReconnectResult(result_1, server.name);
              onComplete?.(message_0);
            } catch (err_2) {
              if (server.config.type === "claudeai-proxy") {
                logEvent("tengu_claudeai_mcp_reconnect", {
                  success: false
                });
              }
              onComplete?.(handleReconnectError(err_2, server.name));
            } finally {
              setIsReconnecting(false);
            }
            break;
          case "toggle-enabled":
            await handleToggleEnabled();
            break;
          case "back":
            onCancel();
            break;
        }
      }, onCancel }) })
    ] }),
    /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: exitState.pending ? /* @__PURE__ */ jsxs(Fragment, { children: [
      "Press ",
      exitState.keyName,
      " again to exit"
    ] }) : /* @__PURE__ */ jsxs(Byline, { children: [
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "\u2191\u2193", action: "navigate" }),
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Enter", action: "select" }),
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "back" })
    ] }) }) })
  ] });
}
export {
  MCPRemoteServerMenu
};
