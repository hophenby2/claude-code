import { jsx, jsxs } from "react/jsx-runtime";
import { APIUserAbortError } from "@anthropic-ai/sdk";
import { useCallback, useRef, useState } from "react";
import { useMainLoopModel } from "../../../../hooks/useMainLoopModel.js";
import { Box, Text } from "../../../../ink.js";
import { useKeybinding } from "../../../../keybindings/useKeybinding.js";
import { createAbortController } from "../../../../utils/abortController.js";
import { editPromptInEditor } from "../../../../utils/promptEditor.js";
import { ConfigurableShortcutHint } from "../../../ConfigurableShortcutHint.js";
import { Byline } from "../../../design-system/Byline.js";
import { Spinner } from "../../../Spinner.js";
import TextInput from "../../../TextInput.js";
import { useWizard } from "../../../wizard/index.js";
import { WizardDialogLayout } from "../../../wizard/WizardDialogLayout.js";
import { generateAgent } from "../../generateAgent.js";
function GenerateStep() {
  const {
    updateWizardData,
    goBack,
    goToStep,
    wizardData
  } = useWizard();
  const [prompt, setPrompt] = useState(wizardData.generationPrompt || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [cursorOffset, setCursorOffset] = useState(prompt.length);
  const model = useMainLoopModel();
  const abortControllerRef = useRef(null);
  const handleCancelGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsGenerating(false);
      setError("Generation cancelled");
    }
  }, []);
  useKeybinding("confirm:no", handleCancelGeneration, {
    context: "Settings",
    isActive: isGenerating
  });
  const handleExternalEditor = useCallback(async () => {
    const result = await editPromptInEditor(prompt);
    if (result.content !== null) {
      setPrompt(result.content);
      setCursorOffset(result.content.length);
    }
  }, [prompt]);
  useKeybinding("chat:externalEditor", handleExternalEditor, {
    context: "Chat",
    isActive: !isGenerating
  });
  const handleGoBack = useCallback(() => {
    updateWizardData({
      generationPrompt: "",
      agentType: "",
      systemPrompt: "",
      whenToUse: "",
      generatedAgent: void 0,
      wasGenerated: false
    });
    setPrompt("");
    setError(null);
    goBack();
  }, [updateWizardData, goBack]);
  useKeybinding("confirm:no", handleGoBack, {
    context: "Settings",
    isActive: !isGenerating
  });
  const handleGenerate = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError("Please describe what the agent should do");
      return;
    }
    setError(null);
    setIsGenerating(true);
    updateWizardData({
      generationPrompt: trimmedPrompt,
      isGenerating: true
    });
    const controller = createAbortController();
    abortControllerRef.current = controller;
    try {
      const generated = await generateAgent(trimmedPrompt, model, [], controller.signal);
      updateWizardData({
        agentType: generated.identifier,
        whenToUse: generated.whenToUse,
        systemPrompt: generated.systemPrompt,
        generatedAgent: generated,
        isGenerating: false,
        wasGenerated: true
      });
      goToStep(6);
    } catch (err) {
      if (err instanceof APIUserAbortError) {
      } else if (err instanceof Error && !err.message.includes("No assistant message found")) {
        setError(err.message || "Failed to generate agent");
      }
      updateWizardData({
        isGenerating: false
      });
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };
  const subtitle = "Describe what this agent should do and when it should be used (be comprehensive for best results)";
  if (isGenerating) {
    return /* @__PURE__ */ jsx(WizardDialogLayout, { subtitle, footerText: /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Settings", fallback: "Esc", description: "cancel" }), children: /* @__PURE__ */ jsxs(Box, { flexDirection: "row", alignItems: "center", children: [
      /* @__PURE__ */ jsx(Spinner, {}),
      /* @__PURE__ */ jsx(Text, { color: "suggestion", children: " Generating agent from description..." })
    ] }) });
  }
  return /* @__PURE__ */ jsx(WizardDialogLayout, { subtitle, footerText: /* @__PURE__ */ jsxs(Byline, { children: [
    /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:yes", context: "Confirmation", fallback: "Enter", description: "submit" }),
    /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "chat:externalEditor", context: "Chat", fallback: "ctrl+g", description: "open in editor" }),
    /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Settings", fallback: "Esc", description: "go back" })
  ] }), children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    error && /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { color: "error", children: error }) }),
    /* @__PURE__ */ jsx(TextInput, { value: prompt, onChange: setPrompt, onSubmit: handleGenerate, placeholder: "e.g., Help me write unit tests for my code...", columns: 80, cursorOffset, onChangeCursorOffset: setCursorOffset, focus: true, showCursor: true })
  ] }) });
}
export {
  GenerateStep
};
