import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import figures from "figures";
import React, { useState } from "react";
import { useExitOnCtrlCDWithKeybindings } from "../../hooks/useExitOnCtrlCDWithKeybindings.js";
import { Box, color, Text, useTheme } from "../../ink.js";
import { getMcpConfigByName } from "../../services/mcp/config.js";
import { useMcpReconnect, useMcpToggleEnabled } from "../../services/mcp/MCPConnectionManager.js";
import { describeMcpConfigFilePath, filterMcpPromptsByServer } from "../../services/mcp/utils.js";
import { useAppState } from "../../state/AppState.js";
import { errorMessage } from "../../utils/errors.js";
import { capitalize } from "../../utils/stringUtils.js";
import { ConfigurableShortcutHint } from "../ConfigurableShortcutHint.js";
import { Select } from "../CustomSelect/index.js";
import { Byline } from "../design-system/Byline.js";
import { KeyboardShortcutHint } from "../design-system/KeyboardShortcutHint.js";
import { Spinner } from "../Spinner.js";
import { CapabilitiesSection } from "./CapabilitiesSection.js";
import { handleReconnectError, handleReconnectResult } from "./utils/reconnectHelpers.js";
function MCPStdioServerMenu({
  server,
  serverToolsCount,
  onViewTools,
  onCancel,
  onComplete,
  borderless = false
}) {
  const [theme] = useTheme();
  const exitState = useExitOnCtrlCDWithKeybindings();
  const mcp = useAppState((s) => s.mcp);
  const reconnectMcpServer = useMcpReconnect();
  const toggleMcpServer = useMcpToggleEnabled();
  const [isReconnecting, setIsReconnecting] = useState(false);
  const handleToggleEnabled = React.useCallback(async () => {
    const wasEnabled = server.client.type !== "disabled";
    try {
      await toggleMcpServer(server.name);
      onCancel();
    } catch (err) {
      const action = wasEnabled ? "disable" : "enable";
      onComplete(`Failed to ${action} MCP server '${server.name}': ${errorMessage(err)}`);
    }
  }, [server.client.type, server.name, toggleMcpServer, onCancel, onComplete]);
  const capitalizedServerName = capitalize(String(server.name));
  const serverCommandsCount = filterMcpPromptsByServer(mcp.commands, server.name).length;
  const menuOptions = [];
  if (server.client.type !== "disabled" && serverToolsCount > 0) {
    menuOptions.push({
      label: "View tools",
      value: "tools"
    });
  }
  if (server.client.type !== "disabled") {
    menuOptions.push({
      label: "Reconnect",
      value: "reconnectMcpServer"
    });
  }
  menuOptions.push({
    label: server.client.type !== "disabled" ? "Disable" : "Enable",
    value: "toggle-enabled"
  });
  if (menuOptions.length === 0) {
    menuOptions.push({
      label: "Back",
      value: "back"
    });
  }
  if (isReconnecting) {
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, padding: 1, children: [
      /* @__PURE__ */ jsxs(Text, { color: "text", children: [
        "Reconnecting to ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: server.name })
      ] }),
      /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Spinner, {}),
        /* @__PURE__ */ jsx(Text, { children: " Restarting MCP server process" })
      ] }),
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: "This may take a few moments." })
    ] });
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
          ] }) : /* @__PURE__ */ jsxs(Text, { children: [
            color("error", theme)(figures.cross),
            " failed"
          ] })
        ] }),
        /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Text, { bold: true, children: "Command: " }),
          /* @__PURE__ */ jsx(Text, { dimColor: true, children: server.config.command })
        ] }),
        server.config.args && server.config.args.length > 0 && /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Text, { bold: true, children: "Args: " }),
          /* @__PURE__ */ jsx(Text, { dimColor: true, children: server.config.args.join(" ") })
        ] }),
        /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Text, { bold: true, children: "Config location: " }),
          /* @__PURE__ */ jsx(Text, { dimColor: true, children: describeMcpConfigFilePath(getMcpConfigByName(server.name)?.scope ?? "dynamic") })
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
      menuOptions.length > 0 && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Select, { options: menuOptions, onChange: async (value) => {
        if (value === "tools") {
          onViewTools();
        } else if (value === "reconnectMcpServer") {
          setIsReconnecting(true);
          try {
            const result = await reconnectMcpServer(server.name);
            const {
              message
            } = handleReconnectResult(result, server.name);
            onComplete?.(message);
          } catch (err_0) {
            onComplete?.(handleReconnectError(err_0, server.name));
          } finally {
            setIsReconnecting(false);
          }
        } else if (value === "toggle-enabled") {
          await handleToggleEnabled();
        } else if (value === "back") {
          onCancel();
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
  MCPStdioServerMenu
};
