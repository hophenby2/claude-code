import { jsx, jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef } from "react";
import { isBridgeEnabled } from "../bridge/bridgeEnabled.js";
import { Box, Text } from "../ink.js";
import { getClaudeAIOAuthTokens } from "../utils/auth.js";
import { getGlobalConfig, saveGlobalConfig } from "../utils/config.js";
import { Select } from "./CustomSelect/select.js";
import { PermissionDialog } from "./permissions/PermissionDialog.js";
function RemoteCallout({
  onDone
}) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const handleCancel = useCallback(() => {
    onDoneRef.current("dismiss");
  }, []);
  useEffect(() => {
    saveGlobalConfig((current) => {
      if (current.remoteDialogSeen) return current;
      return {
        ...current,
        remoteDialogSeen: true
      };
    });
  }, []);
  const handleSelect = useCallback((value) => {
    onDoneRef.current(value);
  }, []);
  const options = [{
    label: "Enable Remote Control for this session",
    description: "Opens a secure connection to claude.ai.",
    value: "enable"
  }, {
    label: "Never mind",
    description: "You can always enable it later with /remote-control.",
    value: "dismiss"
  }];
  return /* @__PURE__ */ jsx(PermissionDialog, { title: "Remote Control", children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", paddingX: 2, paddingY: 1, children: [
    /* @__PURE__ */ jsxs(Box, { marginBottom: 1, flexDirection: "column", children: [
      /* @__PURE__ */ jsx(Text, { children: "Remote Control lets you access this CLI session from the web (claude.ai/code) or the Claude app, so you can pick up where you left off on any device." }),
      /* @__PURE__ */ jsx(Text, { children: " " }),
      /* @__PURE__ */ jsx(Text, { children: "You can disconnect remote access anytime by running /remote-control again." })
    ] }),
    /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Select, { options, onChange: handleSelect, onCancel: handleCancel }) })
  ] }) });
}
function shouldShowRemoteCallout() {
  const config = getGlobalConfig();
  if (config.remoteDialogSeen) return false;
  if (!isBridgeEnabled()) return false;
  const tokens = getClaudeAIOAuthTokens();
  if (!tokens?.accessToken) return false;
  return true;
}
export {
  RemoteCallout,
  shouldShowRemoteCallout
};
