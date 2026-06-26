import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useTheme } from "../../../ink.js";
import { useKeybinding } from "../../../keybindings/useKeybinding.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../../../services/analytics/growthbook.js";
import { logEvent } from "../../../services/analytics/index.js";
import { sanitizeToolNameForAnalytics } from "../../../services/analytics/metadata.js";
import { getDestructiveCommandWarning } from "../../../tools/PowerShellTool/destructiveCommandWarning.js";
import { PowerShellTool } from "../../../tools/PowerShellTool/PowerShellTool.js";
import { isAllowlistedCommand } from "../../../tools/PowerShellTool/readOnlyValidation.js";
import { getCompoundCommandPrefixesStatic } from "../../../utils/powershell/staticPrefix.js";
import { Select } from "../../CustomSelect/select.js";
import { usePermissionRequestLogging } from "../hooks.js";
import { PermissionDecisionDebugInfo } from "../PermissionDecisionDebugInfo.js";
import { PermissionDialog } from "../PermissionDialog.js";
import { PermissionExplainerContent, usePermissionExplainerUI } from "../PermissionExplanation.js";
import { PermissionRuleExplanation } from "../PermissionRuleExplanation.js";
import { useShellPermissionFeedback } from "../useShellPermissionFeedback.js";
import { logUnaryPermissionEvent } from "../utils.js";
import { powershellToolUseOptions } from "./powershellToolUseOptions.js";
function PowerShellPermissionRequest(props) {
  const {
    toolUseConfirm,
    toolUseContext,
    onDone,
    onReject,
    workerBadge
  } = props;
  const {
    command,
    description
  } = PowerShellTool.inputSchema.parse(toolUseConfirm.input);
  const [theme] = useTheme();
  const explainerState = usePermissionExplainerUI({
    toolName: toolUseConfirm.tool.name,
    toolInput: toolUseConfirm.input,
    toolDescription: toolUseConfirm.description,
    messages: toolUseContext.messages
  });
  const {
    yesInputMode,
    noInputMode,
    yesFeedbackModeEntered,
    noFeedbackModeEntered,
    acceptFeedback,
    rejectFeedback,
    setAcceptFeedback,
    setRejectFeedback,
    focusedOption,
    handleInputModeToggle,
    handleReject,
    handleFocus
  } = useShellPermissionFeedback({
    toolUseConfirm,
    onDone,
    onReject,
    explainerVisible: explainerState.visible
  });
  const destructiveWarning = getFeatureValue_CACHED_MAY_BE_STALE("tengu_destructive_command_warning", false) ? getDestructiveCommandWarning(command) : null;
  const [showPermissionDebug, setShowPermissionDebug] = useState(false);
  const [editablePrefix, setEditablePrefix] = useState(command.includes("\n") ? void 0 : command);
  const hasUserEditedPrefix = useRef(false);
  useEffect(() => {
    let cancelled = false;
    getCompoundCommandPrefixesStatic(command, (element) => isAllowlistedCommand(element, element.text)).then((prefixes) => {
      if (cancelled || hasUserEditedPrefix.current) return;
      if (prefixes.length > 0) {
        setEditablePrefix(`${prefixes[0]}:*`);
      }
    }).catch(() => {
    });
    return () => {
      cancelled = true;
    };
  }, [command]);
  const onEditablePrefixChange = useCallback((value) => {
    hasUserEditedPrefix.current = true;
    setEditablePrefix(value);
  }, []);
  const unaryEvent = useMemo(() => ({
    completion_type: "tool_use_single",
    language_name: "none"
  }), []);
  usePermissionRequestLogging(toolUseConfirm, unaryEvent);
  const options = useMemo(() => powershellToolUseOptions({
    suggestions: toolUseConfirm.permissionResult.behavior === "ask" ? toolUseConfirm.permissionResult.suggestions : void 0,
    onRejectFeedbackChange: setRejectFeedback,
    onAcceptFeedbackChange: setAcceptFeedback,
    yesInputMode,
    noInputMode,
    editablePrefix,
    onEditablePrefixChange
  }), [toolUseConfirm, yesInputMode, noInputMode, editablePrefix, onEditablePrefixChange]);
  const handleToggleDebug = useCallback(() => {
    setShowPermissionDebug((prev) => !prev);
  }, []);
  useKeybinding("permission:toggleDebug", handleToggleDebug, {
    context: "Confirmation"
  });
  function onSelect(value) {
    const optionIndex = {
      yes: 1,
      "yes-apply-suggestions": 2,
      "yes-prefix-edited": 2,
      no: 3
    };
    logEvent("tengu_permission_request_option_selected", {
      option_index: optionIndex[value],
      explainer_visible: explainerState.visible
    });
    const toolNameForAnalytics = sanitizeToolNameForAnalytics(toolUseConfirm.tool.name);
    if (value === "yes-prefix-edited") {
      const trimmedPrefix = (editablePrefix ?? "").trim();
      logUnaryPermissionEvent("tool_use_single", toolUseConfirm, "accept");
      if (!trimmedPrefix) {
        toolUseConfirm.onAllow(toolUseConfirm.input, []);
      } else {
        const prefixUpdates = [{
          type: "addRules",
          rules: [{
            toolName: PowerShellTool.name,
            ruleContent: trimmedPrefix
          }],
          behavior: "allow",
          destination: "localSettings"
        }];
        toolUseConfirm.onAllow(toolUseConfirm.input, prefixUpdates);
      }
      onDone();
      return;
    }
    switch (value) {
      case "yes": {
        const trimmedFeedback = acceptFeedback.trim();
        logUnaryPermissionEvent("tool_use_single", toolUseConfirm, "accept");
        logEvent("tengu_accept_submitted", {
          toolName: toolNameForAnalytics,
          isMcp: toolUseConfirm.tool.isMcp ?? false,
          has_instructions: !!trimmedFeedback,
          instructions_length: trimmedFeedback.length,
          entered_feedback_mode: yesFeedbackModeEntered
        });
        toolUseConfirm.onAllow(toolUseConfirm.input, [], trimmedFeedback || void 0);
        onDone();
        break;
      }
      case "yes-apply-suggestions": {
        logUnaryPermissionEvent("tool_use_single", toolUseConfirm, "accept");
        const permissionUpdates = "suggestions" in toolUseConfirm.permissionResult ? toolUseConfirm.permissionResult.suggestions || [] : [];
        toolUseConfirm.onAllow(toolUseConfirm.input, permissionUpdates);
        onDone();
        break;
      }
      case "no": {
        const trimmedFeedback = rejectFeedback.trim();
        logEvent("tengu_reject_submitted", {
          toolName: toolNameForAnalytics,
          isMcp: toolUseConfirm.tool.isMcp ?? false,
          has_instructions: !!trimmedFeedback,
          instructions_length: trimmedFeedback.length,
          entered_feedback_mode: noFeedbackModeEntered
        });
        handleReject(trimmedFeedback || void 0);
        break;
      }
    }
  }
  return /* @__PURE__ */ jsxs(PermissionDialog, { workerBadge, title: "PowerShell command", children: [
    /* @__PURE__ */ jsxs(Box, { flexDirection: "column", paddingX: 2, paddingY: 1, children: [
      /* @__PURE__ */ jsx(Text, { dimColor: explainerState.visible, children: PowerShellTool.renderToolUseMessage(
        {
          command,
          description
        },
        {
          theme,
          verbose: true
        }
        // always show the full command
      ) }),
      !explainerState.visible && /* @__PURE__ */ jsx(Text, { dimColor: true, children: toolUseConfirm.description }),
      /* @__PURE__ */ jsx(PermissionExplainerContent, { visible: explainerState.visible, promise: explainerState.promise })
    ] }),
    showPermissionDebug ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(PermissionDecisionDebugInfo, { permissionResult: toolUseConfirm.permissionResult, toolName: "PowerShell" }),
      toolUseContext.options.debug && /* @__PURE__ */ jsx(Box, { justifyContent: "flex-end", marginTop: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Ctrl-D to hide debug info" }) })
    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        /* @__PURE__ */ jsx(PermissionRuleExplanation, { permissionResult: toolUseConfirm.permissionResult, toolType: "command" }),
        destructiveWarning && /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { color: "warning", children: destructiveWarning }) }),
        /* @__PURE__ */ jsx(Text, { children: "Do you want to proceed?" }),
        /* @__PURE__ */ jsx(Select, { options, inlineDescriptions: true, onChange: onSelect, onCancel: () => handleReject(), onFocus: handleFocus, onInputModeToggle: handleInputModeToggle })
      ] }),
      /* @__PURE__ */ jsxs(Box, { justifyContent: "space-between", marginTop: 1, children: [
        /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          "Esc to cancel",
          (focusedOption === "yes" && !yesInputMode || focusedOption === "no" && !noInputMode) && " \xB7 Tab to amend",
          explainerState.enabled && ` \xB7 ctrl+e to ${explainerState.visible ? "hide" : "explain"}`
        ] }),
        toolUseContext.options.debug && /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Ctrl+d to show debug info" })
      ] })
    ] })
  ] });
}
export {
  PowerShellPermissionRequest
};
