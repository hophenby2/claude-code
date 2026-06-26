import { jsx, jsxs } from "react/jsx-runtime";
import figures from "figures";
import { useCallback, useEffect, useRef, useState } from "react";
import { Box, color, Link, Text, useTheme } from "../../ink.js";
import { useKeybinding } from "../../keybindings/useKeybinding.js";
import { AuthenticationCancelledError, performMCPOAuthFlow } from "../../services/mcp/auth.js";
import { capitalize } from "../../utils/stringUtils.js";
import { ConfigurableShortcutHint } from "../ConfigurableShortcutHint.js";
import { Select } from "../CustomSelect/index.js";
import { Byline } from "../design-system/Byline.js";
import { Dialog } from "../design-system/Dialog.js";
import { KeyboardShortcutHint } from "../design-system/KeyboardShortcutHint.js";
import { Spinner } from "../Spinner.js";
function MCPAgentServerMenu({
  agentServer,
  onCancel,
  onComplete
}) {
  const [theme] = useTheme();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState(null);
  const [authorizationUrl, setAuthorizationUrl] = useState(null);
  const authAbortControllerRef = useRef(null);
  useEffect(() => () => authAbortControllerRef.current?.abort(), []);
  const handleEscCancel = useCallback(() => {
    if (isAuthenticating) {
      authAbortControllerRef.current?.abort();
      authAbortControllerRef.current = null;
      setIsAuthenticating(false);
      setAuthorizationUrl(null);
    }
  }, [isAuthenticating]);
  useKeybinding("confirm:no", handleEscCancel, {
    context: "Confirmation",
    isActive: isAuthenticating
  });
  const handleAuthenticate = useCallback(async () => {
    if (!agentServer.needsAuth || !agentServer.url) {
      return;
    }
    setIsAuthenticating(true);
    setError(null);
    const controller = new AbortController();
    authAbortControllerRef.current = controller;
    try {
      const tempConfig = {
        type: agentServer.transport,
        url: agentServer.url
      };
      await performMCPOAuthFlow(agentServer.name, tempConfig, setAuthorizationUrl, controller.signal);
      onComplete?.(`Authentication successful for ${agentServer.name}. The server will connect when the agent runs.`);
    } catch (err) {
      if (err instanceof Error && !(err instanceof AuthenticationCancelledError)) {
        setError(err.message);
      }
    } finally {
      setIsAuthenticating(false);
      authAbortControllerRef.current = null;
    }
  }, [agentServer, onComplete]);
  const capitalizedServerName = capitalize(String(agentServer.name));
  if (isAuthenticating) {
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, padding: 1, children: [
      /* @__PURE__ */ jsxs(Text, { color: "claude", children: [
        "Authenticating with ",
        agentServer.name,
        "\u2026"
      ] }),
      /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Spinner, {}),
        /* @__PURE__ */ jsx(Text, { children: " A browser window will open for authentication" })
      ] }),
      authorizationUrl && /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "If your browser doesn't open automatically, copy this URL manually:" }),
        /* @__PURE__ */ jsx(Link, { url: authorizationUrl })
      ] }),
      /* @__PURE__ */ jsx(Box, { marginLeft: 3, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "Return here after authenticating in your browser.",
        " ",
        /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "go back" })
      ] }) })
    ] });
  }
  const menuOptions = [];
  if (agentServer.needsAuth) {
    menuOptions.push({
      label: agentServer.isAuthenticated ? "Re-authenticate" : "Authenticate",
      value: "auth"
    });
  }
  menuOptions.push({
    label: "Back",
    value: "back"
  });
  return /* @__PURE__ */ jsxs(Dialog, { title: `${capitalizedServerName} MCP Server`, subtitle: "agent-only", onCancel, inputGuide: (exitState) => exitState.pending ? /* @__PURE__ */ jsxs(Text, { children: [
    "Press ",
    exitState.keyName,
    " again to exit"
  ] }) : /* @__PURE__ */ jsxs(Byline, { children: [
    /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "\u2191\u2193", action: "navigate" }),
    /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Enter", action: "confirm" }),
    /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "go back" })
  ] }), children: [
    /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 0, children: [
      /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Text, { bold: true, children: "Type: " }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: agentServer.transport })
      ] }),
      agentServer.url && /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Text, { bold: true, children: "URL: " }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: agentServer.url })
      ] }),
      agentServer.command && /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Text, { bold: true, children: "Command: " }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: agentServer.command })
      ] }),
      /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Text, { bold: true, children: "Used by: " }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: agentServer.sourceAgents.join(", ") })
      ] }),
      /* @__PURE__ */ jsxs(Box, { marginTop: 1, children: [
        /* @__PURE__ */ jsx(Text, { bold: true, children: "Status: " }),
        /* @__PURE__ */ jsxs(Text, { children: [
          color("inactive", theme)(figures.radioOff),
          " not connected (agent-only)"
        ] })
      ] }),
      agentServer.needsAuth && /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Text, { bold: true, children: "Auth: " }),
        agentServer.isAuthenticated ? /* @__PURE__ */ jsxs(Text, { children: [
          color("success", theme)(figures.tick),
          " authenticated"
        ] }) : /* @__PURE__ */ jsxs(Text, { children: [
          color("warning", theme)(figures.triangleUpOutline),
          " may need authentication"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "This server connects only when running the agent." }) }),
    error && /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(Text, { color: "error", children: [
      "Error: ",
      error
    ] }) }),
    /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Select, { options: menuOptions, onChange: async (value) => {
      switch (value) {
        case "auth":
          await handleAuthenticate();
          break;
        case "back":
          onCancel();
          break;
      }
    }, onCancel }) })
  ] });
}
export {
  MCPAgentServerMenu
};
