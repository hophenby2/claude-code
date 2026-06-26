import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
const feature = (_name) => false;
import "figures";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useTheme } from "../../../ink.js";
import { useKeybinding } from "../../../keybindings/useKeybinding.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../../../services/analytics/growthbook.js";
import { logEvent } from "../../../services/analytics/index.js";
import { sanitizeToolNameForAnalytics } from "../../../services/analytics/metadata.js";
import { useAppState } from "../../../state/AppState.js";
import { BashTool } from "../../../tools/BashTool/BashTool.js";
import { getFirstWordPrefix, getSimpleCommandPrefix } from "../../../tools/BashTool/bashPermissions.js";
import { getDestructiveCommandWarning } from "../../../tools/BashTool/destructiveCommandWarning.js";
import { parseSedEditCommand } from "../../../tools/BashTool/sedEditParser.js";
import { shouldUseSandbox } from "../../../tools/BashTool/shouldUseSandbox.js";
import { getCompoundCommandPrefixesStatic } from "../../../utils/bash/prefix.js";
import { generateGenericDescription, getBashPromptAllowDescriptions, isClassifierPermissionsEnabled } from "../../../utils/permissions/bashClassifier.js";
import { extractRules } from "../../../utils/permissions/PermissionUpdate.js";
import { SandboxManager } from "../../../utils/sandbox/sandbox-adapter.js";
import { Select } from "../../CustomSelect/select.js";
import { ShimmerChar } from "../../Spinner/ShimmerChar.js";
import { useShimmerAnimation } from "../../Spinner/useShimmerAnimation.js";
import { usePermissionRequestLogging } from "../hooks.js";
import { PermissionDecisionDebugInfo } from "../PermissionDecisionDebugInfo.js";
import { PermissionDialog } from "../PermissionDialog.js";
import { PermissionExplainerContent, usePermissionExplainerUI } from "../PermissionExplanation.js";
import { PermissionRuleExplanation } from "../PermissionRuleExplanation.js";
import { SedEditPermissionRequest } from "../SedEditPermissionRequest/SedEditPermissionRequest.js";
import { useShellPermissionFeedback } from "../useShellPermissionFeedback.js";
import { logUnaryPermissionEvent } from "../utils.js";
import { bashToolUseOptions } from "./bashToolUseOptions.js";
const CHECKING_TEXT = "Attempting to auto-approve\u2026";
function ClassifierCheckingSubtitle() {
  const $ = _c(6);
  const [ref, glimmerIndex] = useShimmerAnimation("requesting", CHECKING_TEXT, false);
  let t0;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t0 = [...CHECKING_TEXT];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  let t1;
  if ($[1] !== glimmerIndex) {
    t1 = /* @__PURE__ */ jsx(Text, { children: t0.map((char, i) => /* @__PURE__ */ jsx(ShimmerChar, { char, index: i, glimmerIndex, messageColor: "inactive", shimmerColor: "subtle" }, i)) });
    $[1] = glimmerIndex;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  let t2;
  if ($[3] !== ref || $[4] !== t1) {
    t2 = /* @__PURE__ */ jsx(Box, { ref, children: t1 });
    $[3] = ref;
    $[4] = t1;
    $[5] = t2;
  } else {
    t2 = $[5];
  }
  return t2;
}
function BashPermissionRequest(props) {
  const $ = _c(21);
  const {
    toolUseConfirm,
    toolUseContext,
    onDone,
    onReject,
    verbose,
    workerBadge
  } = props;
  let command;
  let description;
  let t0;
  if ($[0] !== toolUseConfirm.input) {
    ({
      command,
      description
    } = BashTool.inputSchema.parse(toolUseConfirm.input));
    t0 = parseSedEditCommand(command);
    $[0] = toolUseConfirm.input;
    $[1] = command;
    $[2] = description;
    $[3] = t0;
  } else {
    command = $[1];
    description = $[2];
    t0 = $[3];
  }
  const sedInfo = t0;
  if (sedInfo) {
    let t12;
    if ($[4] !== onDone || $[5] !== onReject || $[6] !== sedInfo || $[7] !== toolUseConfirm || $[8] !== toolUseContext || $[9] !== verbose || $[10] !== workerBadge) {
      t12 = /* @__PURE__ */ jsx(SedEditPermissionRequest, { toolUseConfirm, toolUseContext, onDone, onReject, verbose, workerBadge, sedInfo });
      $[4] = onDone;
      $[5] = onReject;
      $[6] = sedInfo;
      $[7] = toolUseConfirm;
      $[8] = toolUseContext;
      $[9] = verbose;
      $[10] = workerBadge;
      $[11] = t12;
    } else {
      t12 = $[11];
    }
    return t12;
  }
  let t1;
  if ($[12] !== command || $[13] !== description || $[14] !== onDone || $[15] !== onReject || $[16] !== toolUseConfirm || $[17] !== toolUseContext || $[18] !== verbose || $[19] !== workerBadge) {
    t1 = /* @__PURE__ */ jsx(BashPermissionRequestInner, { toolUseConfirm, toolUseContext, onDone, onReject, verbose, workerBadge, command, description });
    $[12] = command;
    $[13] = description;
    $[14] = onDone;
    $[15] = onReject;
    $[16] = toolUseConfirm;
    $[17] = toolUseContext;
    $[18] = verbose;
    $[19] = workerBadge;
    $[20] = t1;
  } else {
    t1 = $[20];
  }
  return t1;
}
function BashPermissionRequestInner({
  toolUseConfirm,
  toolUseContext,
  onDone,
  onReject,
  verbose: _verbose,
  workerBadge,
  command,
  description
}) {
  const [theme] = useTheme();
  const toolPermissionContext = useAppState((s) => s.toolPermissionContext);
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
  const [showPermissionDebug, setShowPermissionDebug] = useState(false);
  const [classifierDescription, setClassifierDescription] = useState(description || "");
  const [initialClassifierDescriptionEmpty, setInitialClassifierDescriptionEmpty] = useState(!description?.trim());
  useEffect(() => {
    if (!isClassifierPermissionsEnabled()) return;
    const abortController = new AbortController();
    generateGenericDescription(command, description, abortController.signal).then((generic) => {
      if (generic && !abortController.signal.aborted) {
        setClassifierDescription(generic);
        setInitialClassifierDescriptionEmpty(false);
      }
    }).catch(() => {
    });
    return () => abortController.abort();
  }, [command, description]);
  const isCompound = toolUseConfirm.permissionResult.decisionReason?.type === "subcommandResults";
  const [editablePrefix, setEditablePrefix] = useState(() => {
    if (isCompound) {
      const backendBashRules = extractRules("suggestions" in toolUseConfirm.permissionResult ? toolUseConfirm.permissionResult.suggestions : void 0).filter((r) => r.toolName === BashTool.name && r.ruleContent);
      return backendBashRules.length === 1 ? backendBashRules[0].ruleContent : void 0;
    }
    const two = getSimpleCommandPrefix(command);
    if (two) return `${two}:*`;
    const one = getFirstWordPrefix(command);
    if (one) return `${one}:*`;
    return command;
  });
  const hasUserEditedPrefix = useRef(false);
  const onEditablePrefixChange = useCallback((value) => {
    hasUserEditedPrefix.current = true;
    setEditablePrefix(value);
  }, []);
  useEffect(() => {
    if (isCompound) return;
    let cancelled = false;
    getCompoundCommandPrefixesStatic(command, (subcmd) => BashTool.isReadOnly({
      command: subcmd
    })).then((prefixes) => {
      if (cancelled || hasUserEditedPrefix.current) return;
      if (prefixes.length > 0) {
        setEditablePrefix(`${prefixes[0]}:*`);
      }
    }).catch(() => {
    });
    return () => {
      cancelled = true;
    };
  }, [command, isCompound]);
  const [classifierWasChecking] = useState(false ? !!toolUseConfirm.classifierCheckInProgress : false);
  const {
    destructiveWarning: destructiveWarning_0,
    sandboxingEnabled: sandboxingEnabled_0,
    isSandboxed: isSandboxed_0
  } = useMemo(() => {
    const destructiveWarning = getFeatureValue_CACHED_MAY_BE_STALE("tengu_destructive_command_warning", false) ? getDestructiveCommandWarning(command) : null;
    const sandboxingEnabled = SandboxManager.isSandboxingEnabled();
    const isSandboxed = sandboxingEnabled && shouldUseSandbox(toolUseConfirm.input);
    return {
      destructiveWarning,
      sandboxingEnabled,
      isSandboxed
    };
  }, [command, toolUseConfirm.input]);
  const unaryEvent = useMemo(() => ({
    completion_type: "tool_use_single",
    language_name: "none"
  }), []);
  usePermissionRequestLogging(toolUseConfirm, unaryEvent);
  const existingAllowDescriptions = useMemo(() => getBashPromptAllowDescriptions(toolPermissionContext), [toolPermissionContext]);
  const options = useMemo(() => bashToolUseOptions({
    suggestions: toolUseConfirm.permissionResult.behavior === "ask" ? toolUseConfirm.permissionResult.suggestions : void 0,
    decisionReason: toolUseConfirm.permissionResult.decisionReason,
    onRejectFeedbackChange: setRejectFeedback,
    onAcceptFeedbackChange: setAcceptFeedback,
    onClassifierDescriptionChange: setClassifierDescription,
    classifierDescription,
    initialClassifierDescriptionEmpty,
    existingAllowDescriptions,
    yesInputMode,
    noInputMode,
    editablePrefix,
    onEditablePrefixChange
  }), [toolUseConfirm, classifierDescription, initialClassifierDescriptionEmpty, existingAllowDescriptions, yesInputMode, noInputMode, editablePrefix, onEditablePrefixChange]);
  const handleToggleDebug = useCallback(() => {
    setShowPermissionDebug((prev) => !prev);
  }, []);
  useKeybinding("permission:toggleDebug", handleToggleDebug, {
    context: "Confirmation"
  });
  const handleDismissCheckmark = useCallback(() => {
    toolUseConfirm.onDismissCheckmark?.();
  }, [toolUseConfirm]);
  useKeybinding("confirm:no", handleDismissCheckmark, {
    context: "Confirmation",
    isActive: false ? !!toolUseConfirm.classifierAutoApproved : false
  });
  function onSelect(value_0) {
    let optionIndex = {
      yes: 1,
      "yes-apply-suggestions": 2,
      "yes-prefix-edited": 2,
      no: 3
    };
    if (false) {
      optionIndex = {
        yes: 1,
        "yes-apply-suggestions": 2,
        "yes-prefix-edited": 2,
        "yes-classifier-reviewed": 3,
        no: 4
      };
    }
    logEvent("tengu_permission_request_option_selected", {
      option_index: optionIndex[value_0],
      explainer_visible: explainerState.visible
    });
    const toolNameForAnalytics = sanitizeToolNameForAnalytics(toolUseConfirm.tool.name);
    if (value_0 === "yes-prefix-edited") {
      const trimmedPrefix = (editablePrefix ?? "").trim();
      logUnaryPermissionEvent("tool_use_single", toolUseConfirm, "accept");
      if (!trimmedPrefix) {
        toolUseConfirm.onAllow(toolUseConfirm.input, []);
      } else {
        const prefixUpdates = [{
          type: "addRules",
          rules: [{
            toolName: BashTool.name,
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
    if (false) {
      const trimmedDescription = classifierDescription.trim();
      logUnaryPermissionEvent("tool_use_single", toolUseConfirm, "accept");
      if (!trimmedDescription) {
        toolUseConfirm.onAllow(toolUseConfirm.input, []);
      } else {
        const permissionUpdates = [{
          type: "addRules",
          rules: [{
            toolName: BashTool.name,
            ruleContent: createPromptRuleContent(trimmedDescription)
          }],
          behavior: "allow",
          destination: "session"
        }];
        toolUseConfirm.onAllow(toolUseConfirm.input, permissionUpdates);
      }
      onDone();
      return;
    }
    switch (value_0) {
      case "yes": {
        const trimmedFeedback_0 = acceptFeedback.trim();
        logUnaryPermissionEvent("tool_use_single", toolUseConfirm, "accept");
        logEvent("tengu_accept_submitted", {
          toolName: toolNameForAnalytics,
          isMcp: toolUseConfirm.tool.isMcp ?? false,
          has_instructions: !!trimmedFeedback_0,
          instructions_length: trimmedFeedback_0.length,
          entered_feedback_mode: yesFeedbackModeEntered
        });
        toolUseConfirm.onAllow(toolUseConfirm.input, [], trimmedFeedback_0 || void 0);
        onDone();
        break;
      }
      case "yes-apply-suggestions": {
        logUnaryPermissionEvent("tool_use_single", toolUseConfirm, "accept");
        const permissionUpdates_0 = "suggestions" in toolUseConfirm.permissionResult ? toolUseConfirm.permissionResult.suggestions || [] : [];
        toolUseConfirm.onAllow(toolUseConfirm.input, permissionUpdates_0);
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
  const classifierSubtitle = false ? toolUseConfirm.classifierAutoApproved ? /* @__PURE__ */ jsxs(Text, { children: [
    /* @__PURE__ */ jsxs(Text, { color: "success", children: [
      figures.tick,
      " Auto-approved"
    ] }),
    toolUseConfirm.classifierMatchedRule && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      ' \xB7 matched "',
      toolUseConfirm.classifierMatchedRule,
      '"'
    ] })
  ] }) : toolUseConfirm.classifierCheckInProgress ? /* @__PURE__ */ jsx(ClassifierCheckingSubtitle, {}) : classifierWasChecking ? /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Requires manual approval" }) : void 0 : void 0;
  return /* @__PURE__ */ jsxs(PermissionDialog, { workerBadge, title: sandboxingEnabled_0 && !isSandboxed_0 ? "Bash command (unsandboxed)" : "Bash command", subtitle: classifierSubtitle, children: [
    /* @__PURE__ */ jsxs(Box, { flexDirection: "column", paddingX: 2, paddingY: 1, children: [
      /* @__PURE__ */ jsx(Text, { dimColor: explainerState.visible, children: BashTool.renderToolUseMessage(
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
      /* @__PURE__ */ jsx(PermissionDecisionDebugInfo, { permissionResult: toolUseConfirm.permissionResult, toolName: "Bash" }),
      toolUseContext.options.debug && /* @__PURE__ */ jsx(Box, { justifyContent: "flex-end", marginTop: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Ctrl-D to hide debug info" }) })
    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        /* @__PURE__ */ jsx(PermissionRuleExplanation, { permissionResult: toolUseConfirm.permissionResult, toolType: "command" }),
        destructiveWarning_0 && /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { color: "warning", dimColor: false ? toolUseConfirm.classifierAutoApproved : false, children: destructiveWarning_0 }) }),
        /* @__PURE__ */ jsx(Text, { dimColor: false ? toolUseConfirm.classifierAutoApproved : false, children: "Do you want to proceed?" }),
        /* @__PURE__ */ jsx(Select, { options: false ? toolUseConfirm.classifierAutoApproved ? options.map((o) => ({
          ...o,
          disabled: true
        })) : options : options, isDisabled: false ? toolUseConfirm.classifierAutoApproved : false, inlineDescriptions: true, onChange: onSelect, onCancel: () => handleReject(), onFocus: handleFocus, onInputModeToggle: handleInputModeToggle })
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
  BashPermissionRequest
};
