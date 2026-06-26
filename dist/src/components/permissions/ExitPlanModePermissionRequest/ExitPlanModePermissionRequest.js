import { Fragment, jsx, jsxs } from "react/jsx-runtime";
const feature = (_name) => false;
import figures from "figures";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNotifications } from "../../../context/notifications.js";
import { logEvent } from "../../../services/analytics/index.js";
import { useAppState, useAppStateStore, useSetAppState } from "../../../state/AppState.js";
import { getSdkBetas, getSessionId, isSessionPersistenceDisabled, setHasExitedPlanMode, setNeedsPlanModeExitAttachment } from "../../../bootstrap/state.js";
import { generateSessionName } from "../../../commands/rename/generateSessionName.js";
import { launchUltraplan } from "../../../commands/ultraplan.js";
import { Box, Text } from "../../../ink.js";
import "../../../tools/AgentTool/constants.js";
import { EXIT_PLAN_MODE_V2_TOOL_NAME } from "../../../tools/ExitPlanModeTool/constants.js";
import { TEAM_CREATE_TOOL_NAME } from "../../../tools/TeamCreateTool/constants.js";
import { isAgentSwarmsEnabled } from "../../../utils/agentSwarmsEnabled.js";
import { calculateContextPercentages, getContextWindowForModel } from "../../../utils/context.js";
import { getExternalEditor } from "../../../utils/editor.js";
import { getDisplayPath } from "../../../utils/file.js";
import { toIDEDisplayName } from "../../../utils/ide.js";
import { logError } from "../../../utils/log.js";
import { enqueuePendingNotification } from "../../../utils/messageQueueManager.js";
import { createUserMessage } from "../../../utils/messages.js";
import { getMainLoopModel, getRuntimeMainLoopModel } from "../../../utils/model/model.js";
import { createPromptRuleContent, isClassifierPermissionsEnabled, PROMPT_PREFIX } from "../../../utils/permissions/bashClassifier.js";
import { toExternalPermissionMode } from "../../../utils/permissions/PermissionMode.js";
import "../../../utils/permissions/permissionSetup.js";
import { getPewterLedgerVariant, isPlanModeInterviewPhaseEnabled } from "../../../utils/planModeV2.js";
import { getPlan, getPlanFilePath } from "../../../utils/plans.js";
import { editFileInEditor, editPromptInEditor } from "../../../utils/promptEditor.js";
import { getCurrentSessionTitle, getTranscriptPath, saveAgentName, saveCustomTitle } from "../../../utils/sessionStorage.js";
import { getSettings_DEPRECATED } from "../../../utils/settings/settings.js";
import { Select } from "../../CustomSelect/index.js";
import { Markdown } from "../../Markdown.js";
import { PermissionDialog } from "../PermissionDialog.js";
import { PermissionRuleExplanation } from "../PermissionRuleExplanation.js";
const autoModeStateModule = false ? null : null;
import { maybeResizeAndDownsampleImageBlock } from "../../../utils/imageResizer.js";
import { cacheImagePath, storeImage } from "../../../utils/imageStore.js";
function buildPermissionUpdates(mode, allowedPrompts) {
  const updates = [{
    type: "setMode",
    mode: toExternalPermissionMode(mode),
    destination: "session"
  }];
  if (isClassifierPermissionsEnabled() && allowedPrompts && allowedPrompts.length > 0) {
    updates.push({
      type: "addRules",
      rules: allowedPrompts.map((p) => ({
        toolName: p.tool,
        ruleContent: createPromptRuleContent(p.prompt)
      })),
      behavior: "allow",
      destination: "session"
    });
  }
  return updates;
}
function autoNameSessionFromPlan(plan, setAppState, isClearContext) {
  if (isSessionPersistenceDisabled() || getSettings_DEPRECATED()?.cleanupPeriodDays === 0) {
    return;
  }
  if (!isClearContext && getCurrentSessionTitle(getSessionId())) return;
  void generateSessionName(
    // generateSessionName tail-slices to the last 1000 chars (correct for
    // conversations, where recency matters). Plans front-load the goal and
    // end with testing steps — head-slice so Haiku sees the summary.
    [createUserMessage({
      content: plan.slice(0, 1e3)
    })],
    new AbortController().signal
  ).then(async (name) => {
    if (!name || getCurrentSessionTitle(getSessionId())) return;
    const sessionId = getSessionId();
    const fullPath = getTranscriptPath();
    await saveCustomTitle(sessionId, name, fullPath, "auto");
    await saveAgentName(sessionId, name, fullPath, "auto");
    setAppState((prev) => {
      if (prev.standaloneAgentContext?.name === name) return prev;
      return {
        ...prev,
        standaloneAgentContext: {
          ...prev.standaloneAgentContext,
          name
        }
      };
    });
  }).catch(logError);
}
function ExitPlanModePermissionRequest({
  toolUseConfirm,
  onDone,
  onReject,
  workerBadge,
  setStickyFooter
}) {
  const toolPermissionContext = useAppState((s) => s.toolPermissionContext);
  const setAppState = useSetAppState();
  const store = useAppStateStore();
  const {
    addNotification
  } = useNotifications();
  const [planFeedback, setPlanFeedback] = useState("");
  const [pastedContents, setPastedContents] = useState({});
  const nextPasteIdRef = useRef(0);
  const showClearContext = useAppState((s) => s.settings.showClearContextOnPlanAccept) ?? false;
  const ultraplanSessionUrl = useAppState((s) => s.ultraplanSessionUrl);
  const ultraplanLaunching = useAppState((s) => s.ultraplanLaunching);
  const showUltraplan = false ? !ultraplanSessionUrl && !ultraplanLaunching : false;
  const usage = toolUseConfirm.assistantMessage.message.usage;
  const {
    mode,
    isAutoModeAvailable,
    isBypassPermissionsModeAvailable
  } = toolPermissionContext;
  const options = useMemo(() => buildPlanApprovalOptions({
    showClearContext,
    showUltraplan,
    usedPercent: showClearContext ? getContextUsedPercent(usage, mode) : null,
    isAutoModeAvailable,
    isBypassPermissionsModeAvailable,
    onFeedbackChange: setPlanFeedback
  }), [showClearContext, showUltraplan, usage, mode, isAutoModeAvailable, isBypassPermissionsModeAvailable]);
  function onImagePaste(base64Image, mediaType, filename, dimensions, _sourcePath) {
    const pasteId = nextPasteIdRef.current++;
    const newContent = {
      id: pasteId,
      type: "image",
      content: base64Image,
      mediaType: mediaType || "image/png",
      filename: filename || "Pasted image",
      dimensions
    };
    cacheImagePath(newContent);
    void storeImage(newContent);
    setPastedContents((prev) => ({
      ...prev,
      [pasteId]: newContent
    }));
  }
  const onRemoveImage = useCallback((id) => {
    setPastedContents((prev) => {
      const next = {
        ...prev
      };
      delete next[id];
      return next;
    });
  }, []);
  const imageAttachments = Object.values(pastedContents).filter((c) => c.type === "image");
  const hasImages = imageAttachments.length > 0;
  const isV2 = toolUseConfirm.tool.name === EXIT_PLAN_MODE_V2_TOOL_NAME;
  const inputPlan = isV2 ? void 0 : toolUseConfirm.input.plan;
  const planFilePath = isV2 ? getPlanFilePath() : void 0;
  const allowedPrompts = toolUseConfirm.input.allowedPrompts;
  const rawPlan = inputPlan ?? getPlan();
  const isEmpty = !rawPlan || rawPlan.trim() === "";
  const [planStructureVariant] = useState(() => getPewterLedgerVariant() ?? void 0);
  const [currentPlan, setCurrentPlan] = useState(() => {
    if (inputPlan) return inputPlan;
    const plan = getPlan();
    return plan ?? "No plan found. Please write your plan to the plan file first.";
  });
  const [showSaveMessage, setShowSaveMessage] = useState(false);
  const [planEditedLocally, setPlanEditedLocally] = useState(false);
  useEffect(() => {
    if (showSaveMessage) {
      const timer = setTimeout(setShowSaveMessage, 5e3, false);
      return () => clearTimeout(timer);
    }
  }, [showSaveMessage]);
  const handleKeyDown = (e) => {
    if (e.ctrl && e.key === "g") {
      e.preventDefault();
      logEvent("tengu_plan_external_editor_used", {});
      void (async () => {
        if (isV2 && planFilePath) {
          const result = await editFileInEditor(planFilePath);
          if (result.error) {
            addNotification({
              key: "external-editor-error",
              text: result.error,
              color: "warning",
              priority: "high"
            });
          }
          if (result.content !== null) {
            if (result.content !== currentPlan) setPlanEditedLocally(true);
            setCurrentPlan(result.content);
            setShowSaveMessage(true);
          }
        } else {
          const result = await editPromptInEditor(currentPlan);
          if (result.error) {
            addNotification({
              key: "external-editor-error",
              text: result.error,
              color: "warning",
              priority: "high"
            });
          }
          if (result.content !== null && result.content !== currentPlan) {
            setCurrentPlan(result.content);
            setShowSaveMessage(true);
          }
        }
      })();
      return;
    }
    if (e.shift && e.key === "tab") {
      e.preventDefault();
      void handleResponse(showClearContext ? "yes-accept-edits" : "yes-accept-edits-keep-context");
      return;
    }
  };
  async function handleResponse(value) {
    const trimmedFeedback = planFeedback.trim();
    const acceptFeedback = trimmedFeedback || void 0;
    if (value === "ultraplan") {
      logEvent("tengu_plan_exit", {
        planLengthChars: currentPlan.length,
        outcome: "ultraplan",
        interviewPhaseEnabled: isPlanModeInterviewPhaseEnabled(),
        planStructureVariant
      });
      onDone();
      onReject();
      toolUseConfirm.onReject("Plan being refined via Ultraplan \u2014 please wait for the result.");
      void launchUltraplan({
        blurb: "",
        seedPlan: currentPlan,
        getAppState: store.getState,
        setAppState: store.setState,
        signal: new AbortController().signal
      }).then((msg) => enqueuePendingNotification({
        value: msg,
        mode: "task-notification"
      })).catch(logError);
      return;
    }
    const updatedInput = isV2 && !planEditedLocally ? {} : {
      plan: currentPlan
    };
    if (false) {
      const goingToAuto = (value === "yes-resume-auto-mode" || value === "yes-auto-clear-context") && isAutoModeGateEnabled();
      const autoWasUsedDuringPlan = autoModeStateModule?.isAutoModeActive() ?? false;
      if (value !== "no" && !goingToAuto && autoWasUsedDuringPlan) {
        autoModeStateModule?.setAutoModeActive(false);
        setNeedsAutoModeExitAttachment(true);
        setAppState((prev) => ({
          ...prev,
          toolPermissionContext: {
            ...restoreDangerousPermissions(prev.toolPermissionContext),
            prePlanMode: void 0
          }
        }));
      }
    }
    const isResumeAutoOption = false ? value === "yes-resume-auto-mode" : false;
    const isKeepContextOption = value === "yes-accept-edits-keep-context" || value === "yes-default-keep-context" || isResumeAutoOption;
    if (value !== "no") {
      autoNameSessionFromPlan(currentPlan, setAppState, !isKeepContextOption);
    }
    if (value !== "no" && !isKeepContextOption) {
      let mode2 = "default";
      if (value === "yes-bypass-permissions") {
        mode2 = "bypassPermissions";
      } else if (value === "yes-accept-edits") {
        mode2 = "acceptEdits";
      } else if (false) {
        mode2 = "auto";
        autoModeStateModule?.setAutoModeActive(true);
      }
      logEvent("tengu_plan_exit", {
        planLengthChars: currentPlan.length,
        outcome: value,
        clearContext: true,
        interviewPhaseEnabled: isPlanModeInterviewPhaseEnabled(),
        planStructureVariant,
        hasFeedback: !!acceptFeedback
      });
      const verificationInstruction = false ? `

IMPORTANT: When you have finished implementing the plan, you MUST call the "VerifyPlanExecution" tool directly (NOT the ${AGENT_TOOL_NAME} tool or an agent) to trigger background verification.` : "";
      const transcriptPath = getTranscriptPath();
      const transcriptHint = `

If you need specific details from before exiting plan mode (like exact code snippets, error messages, or content you generated), read the full transcript at: ${transcriptPath}`;
      const teamHint = isAgentSwarmsEnabled() ? `

If this plan can be broken down into multiple independent tasks, consider using the ${TEAM_CREATE_TOOL_NAME} tool to create a team and parallelize the work.` : "";
      const feedbackSuffix = acceptFeedback ? `

User feedback on this plan: ${acceptFeedback}` : "";
      setAppState((prev) => ({
        ...prev,
        initialMessage: {
          message: {
            ...createUserMessage({
              content: `Implement the following plan:

${currentPlan}${verificationInstruction}${transcriptHint}${teamHint}${feedbackSuffix}`
            }),
            planContent: currentPlan
          },
          clearContext: true,
          mode: mode2,
          allowedPrompts
        }
      }));
      setHasExitedPlanMode(true);
      onDone();
      onReject();
      toolUseConfirm.onReject();
      return;
    }
    if (false) {
      logEvent("tengu_plan_exit", {
        planLengthChars: currentPlan.length,
        outcome: value,
        clearContext: false,
        interviewPhaseEnabled: isPlanModeInterviewPhaseEnabled(),
        planStructureVariant,
        hasFeedback: !!acceptFeedback
      });
      setHasExitedPlanMode(true);
      setNeedsPlanModeExitAttachment(true);
      autoModeStateModule?.setAutoModeActive(true);
      setAppState((prev) => ({
        ...prev,
        toolPermissionContext: stripDangerousPermissionsForAutoMode({
          ...prev.toolPermissionContext,
          mode: "auto",
          prePlanMode: void 0
        })
      }));
      onDone();
      toolUseConfirm.onAllow(updatedInput, [], acceptFeedback);
      return;
    }
    const keepContextModes = {
      "yes-accept-edits-keep-context": toolPermissionContext.isBypassPermissionsModeAvailable ? "bypassPermissions" : "acceptEdits",
      "yes-default-keep-context": "default",
      ...false ? {
        "yes-resume-auto-mode": "default"
      } : {}
    };
    const keepContextMode = keepContextModes[value];
    if (keepContextMode) {
      logEvent("tengu_plan_exit", {
        planLengthChars: currentPlan.length,
        outcome: value,
        clearContext: false,
        interviewPhaseEnabled: isPlanModeInterviewPhaseEnabled(),
        planStructureVariant,
        hasFeedback: !!acceptFeedback
      });
      setHasExitedPlanMode(true);
      setNeedsPlanModeExitAttachment(true);
      onDone();
      toolUseConfirm.onAllow(updatedInput, buildPermissionUpdates(keepContextMode, allowedPrompts), acceptFeedback);
      return;
    }
    const standardModes = {
      "yes-bypass-permissions": "bypassPermissions",
      "yes-accept-edits": "acceptEdits"
    };
    const standardMode = standardModes[value];
    if (standardMode) {
      logEvent("tengu_plan_exit", {
        planLengthChars: currentPlan.length,
        outcome: value,
        interviewPhaseEnabled: isPlanModeInterviewPhaseEnabled(),
        planStructureVariant,
        hasFeedback: !!acceptFeedback
      });
      setHasExitedPlanMode(true);
      setNeedsPlanModeExitAttachment(true);
      onDone();
      toolUseConfirm.onAllow(updatedInput, buildPermissionUpdates(standardMode, allowedPrompts), acceptFeedback);
      return;
    }
    if (value === "no") {
      if (!trimmedFeedback && !hasImages) {
        return;
      }
      logEvent("tengu_plan_exit", {
        planLengthChars: currentPlan.length,
        outcome: "no",
        interviewPhaseEnabled: isPlanModeInterviewPhaseEnabled(),
        planStructureVariant
      });
      let imageBlocks;
      if (hasImages) {
        imageBlocks = await Promise.all(imageAttachments.map(async (img) => {
          const block = {
            type: "image",
            source: {
              type: "base64",
              media_type: img.mediaType || "image/png",
              data: img.content
            }
          };
          const resized = await maybeResizeAndDownsampleImageBlock(block);
          return resized.block;
        }));
      }
      onDone();
      onReject();
      toolUseConfirm.onReject(trimmedFeedback || (hasImages ? "(See attached image)" : void 0), imageBlocks && imageBlocks.length > 0 ? imageBlocks : void 0);
    }
  }
  const editor = getExternalEditor();
  const editorName = editor ? toIDEDisplayName(editor) : null;
  const handleResponseRef = useRef(handleResponse);
  handleResponseRef.current = handleResponse;
  const handleCancelRef = useRef(void 0);
  handleCancelRef.current = () => {
    logEvent("tengu_plan_exit", {
      planLengthChars: currentPlan.length,
      outcome: "no",
      interviewPhaseEnabled: isPlanModeInterviewPhaseEnabled(),
      planStructureVariant
    });
    onDone();
    onReject();
    toolUseConfirm.onReject();
  };
  const useStickyFooter = !isEmpty && !!setStickyFooter;
  useLayoutEffect(() => {
    if (!useStickyFooter) return;
    setStickyFooter(/* @__PURE__ */ jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: "planMode", borderLeft: false, borderRight: false, borderBottom: false, paddingX: 1, children: [
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Would you like to proceed?" }),
      /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Select, { options, onChange: (v) => void handleResponseRef.current(v), onCancel: () => handleCancelRef.current?.(), onImagePaste, pastedContents, onRemoveImage }) }),
      editorName && /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 1, marginTop: 1, children: [
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "ctrl-g to edit in " }),
        /* @__PURE__ */ jsx(Text, { bold: true, dimColor: true, children: editorName }),
        isV2 && planFilePath && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          " \xB7 ",
          getDisplayPath(planFilePath)
        ] }),
        showSaveMessage && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { dimColor: true, children: " \xB7 " }),
          /* @__PURE__ */ jsxs(Text, { color: "success", children: [
            figures.tick,
            "Plan saved!"
          ] })
        ] })
      ] })
    ] }));
    return () => setStickyFooter(null);
  }, [useStickyFooter, setStickyFooter, options, pastedContents, editorName, isV2, planFilePath, showSaveMessage]);
  if (isEmpty) {
    let handleEmptyPlanResponse = function(value) {
      if (value === "yes") {
        logEvent("tengu_plan_exit", {
          planLengthChars: 0,
          outcome: "yes-default",
          interviewPhaseEnabled: isPlanModeInterviewPhaseEnabled(),
          planStructureVariant
        });
        if (false) {
          const autoWasUsedDuringPlan = autoModeStateModule?.isAutoModeActive() ?? false;
          if (autoWasUsedDuringPlan) {
            autoModeStateModule?.setAutoModeActive(false);
            setNeedsAutoModeExitAttachment(true);
            setAppState((prev) => ({
              ...prev,
              toolPermissionContext: {
                ...restoreDangerousPermissions(prev.toolPermissionContext),
                prePlanMode: void 0
              }
            }));
          }
        }
        setHasExitedPlanMode(true);
        setNeedsPlanModeExitAttachment(true);
        onDone();
        toolUseConfirm.onAllow({}, [{
          type: "setMode",
          mode: "default",
          destination: "session"
        }]);
      } else {
        logEvent("tengu_plan_exit", {
          planLengthChars: 0,
          outcome: "no",
          interviewPhaseEnabled: isPlanModeInterviewPhaseEnabled(),
          planStructureVariant
        });
        onDone();
        onReject();
        toolUseConfirm.onReject();
      }
    };
    return /* @__PURE__ */ jsx(PermissionDialog, { color: "planMode", title: "Exit plan mode?", workerBadge, children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", paddingX: 1, marginTop: 1, children: [
      /* @__PURE__ */ jsx(Text, { children: "Claude wants to exit plan mode" }),
      /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Select, { options: [{
        label: "Yes",
        value: "yes"
      }, {
        label: "No",
        value: "no"
      }], onChange: handleEmptyPlanResponse, onCancel: () => {
        logEvent("tengu_plan_exit", {
          planLengthChars: 0,
          outcome: "no",
          interviewPhaseEnabled: isPlanModeInterviewPhaseEnabled(),
          planStructureVariant
        });
        onDone();
        onReject();
        toolUseConfirm.onReject();
      } }) })
    ] }) });
  }
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", tabIndex: 0, autoFocus: true, onKeyDown: handleKeyDown, children: [
    /* @__PURE__ */ jsx(PermissionDialog, { color: "planMode", title: "Ready to code?", innerPaddingX: 0, workerBadge, children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
      /* @__PURE__ */ jsx(Box, { paddingX: 1, flexDirection: "column", children: /* @__PURE__ */ jsx(Text, { children: "Here is Claude's plan:" }) }),
      /* @__PURE__ */ jsx(
        Box,
        {
          borderColor: "subtle",
          borderStyle: "dashed",
          flexDirection: "column",
          borderLeft: false,
          borderRight: false,
          paddingX: 1,
          marginBottom: 1,
          overflow: "hidden",
          children: /* @__PURE__ */ jsx(Markdown, { children: currentPlan })
        }
      ),
      /* @__PURE__ */ jsxs(Box, { flexDirection: "column", paddingX: 1, children: [
        /* @__PURE__ */ jsx(PermissionRuleExplanation, { permissionResult: toolUseConfirm.permissionResult, toolType: "tool" }),
        isClassifierPermissionsEnabled() && allowedPrompts && allowedPrompts.length > 0 && /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [
          /* @__PURE__ */ jsx(Text, { bold: true, children: "Requested permissions:" }),
          allowedPrompts.map((p, i) => /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
            "  ",
            "\xB7 ",
            p.tool,
            "(",
            PROMPT_PREFIX,
            " ",
            p.prompt,
            ")"
          ] }, i))
        ] }),
        !useStickyFooter && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Claude has written up a plan and is ready to execute. Would you like to proceed?" }),
          /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Select, { options, onChange: handleResponse, onCancel: () => handleCancelRef.current?.(), onImagePaste, pastedContents, onRemoveImage }) })
        ] })
      ] })
    ] }) }),
    !useStickyFooter && editorName && /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 1, paddingX: 1, marginTop: 1, children: [
      /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "ctrl-g to edit in " }),
        /* @__PURE__ */ jsx(Text, { bold: true, dimColor: true, children: editorName }),
        isV2 && planFilePath && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          " \xB7 ",
          getDisplayPath(planFilePath)
        ] })
      ] }),
      showSaveMessage && /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: " \xB7 " }),
        /* @__PURE__ */ jsxs(Text, { color: "success", children: [
          figures.tick,
          "Plan saved!"
        ] })
      ] })
    ] })
  ] });
}
function buildPlanApprovalOptions({
  showClearContext,
  showUltraplan,
  usedPercent,
  isAutoModeAvailable,
  isBypassPermissionsModeAvailable,
  onFeedbackChange
}) {
  const options = [];
  const usedLabel = usedPercent !== null ? ` (${usedPercent}% used)` : "";
  if (showClearContext) {
    if (false) {
      options.push({
        label: `Yes, clear context${usedLabel} and use auto mode`,
        value: "yes-auto-clear-context"
      });
    } else if (isBypassPermissionsModeAvailable) {
      options.push({
        label: `Yes, clear context${usedLabel} and bypass permissions`,
        value: "yes-bypass-permissions"
      });
    } else {
      options.push({
        label: `Yes, clear context${usedLabel} and auto-accept edits`,
        value: "yes-accept-edits"
      });
    }
  }
  if (false) {
    options.push({
      label: "Yes, and use auto mode",
      value: "yes-resume-auto-mode"
    });
  } else if (isBypassPermissionsModeAvailable) {
    options.push({
      label: "Yes, and bypass permissions",
      value: "yes-accept-edits-keep-context"
    });
  } else {
    options.push({
      label: "Yes, auto-accept edits",
      value: "yes-accept-edits-keep-context"
    });
  }
  options.push({
    label: "Yes, manually approve edits",
    value: "yes-default-keep-context"
  });
  if (showUltraplan) {
    options.push({
      label: "No, refine with Ultraplan on Claude Code on the web",
      value: "ultraplan"
    });
  }
  options.push({
    type: "input",
    label: "No, keep planning",
    value: "no",
    placeholder: "Tell Claude what to change",
    description: "shift+tab to approve with this feedback",
    onChange: onFeedbackChange
  });
  return options;
}
function getContextUsedPercent(usage, permissionMode) {
  if (!usage) return null;
  const runtimeModel = getRuntimeMainLoopModel({
    permissionMode,
    mainLoopModel: getMainLoopModel(),
    exceeds200kTokens: false
  });
  const contextWindowSize = getContextWindowForModel(runtimeModel, getSdkBetas());
  const {
    used
  } = calculateContextPercentages({
    input_tokens: usage.input_tokens,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0
  }, contextWindowSize);
  return used;
}
export {
  ExitPlanModePermissionRequest,
  autoNameSessionFromPlan,
  buildPermissionUpdates,
  buildPlanApprovalOptions
};
