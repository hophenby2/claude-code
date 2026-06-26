import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import figures from "figures";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTerminalSize } from "../../../hooks/useTerminalSize.js";
import { Box, Text } from "../../../ink.js";
import { useKeybinding, useKeybindings } from "../../../keybindings/useKeybinding.js";
import { useAppState } from "../../../state/AppState.js";
import { getExternalEditor } from "../../../utils/editor.js";
import { toIDEDisplayName } from "../../../utils/ide.js";
import { editPromptInEditor } from "../../../utils/promptEditor.js";
import { Divider } from "../../design-system/Divider.js";
import TextInput from "../../TextInput.js";
import { PermissionRequestTitle } from "../PermissionRequestTitle.js";
import { PreviewBox } from "./PreviewBox.js";
import { QuestionNavigationBar } from "./QuestionNavigationBar.js";
function PreviewQuestionView({
  question,
  questions,
  currentQuestionIndex,
  answers,
  questionStates,
  hideSubmitTab = false,
  minContentHeight,
  minContentWidth,
  onUpdateQuestionState,
  onAnswer,
  onTextInputFocus,
  onCancel,
  onTabPrev,
  onTabNext,
  onRespondToClaude,
  onFinishPlanInterview
}) {
  const isInPlanMode = useAppState((s) => s.toolPermissionContext.mode) === "plan";
  const [isFooterFocused, setIsFooterFocused] = useState(false);
  const [footerIndex, setFooterIndex] = useState(0);
  const [isInNotesInput, setIsInNotesInput] = useState(false);
  const [cursorOffset, setCursorOffset] = useState(0);
  const editor = getExternalEditor();
  const editorName = editor ? toIDEDisplayName(editor) : null;
  const questionText = question.question;
  const questionState = questionStates[questionText];
  const allOptions = question.options;
  const [focusedIndex, setFocusedIndex] = useState(0);
  const prevQuestionText = useRef(questionText);
  if (prevQuestionText.current !== questionText) {
    prevQuestionText.current = questionText;
    const selected = questionState?.selectedValue;
    const idx = selected ? allOptions.findIndex((opt) => opt.label === selected) : -1;
    setFocusedIndex(idx >= 0 ? idx : 0);
  }
  const focusedOption = allOptions[focusedIndex];
  const selectedValue = questionState?.selectedValue;
  const notesValue = questionState?.textInputValue || "";
  const handleSelectOption = useCallback((index) => {
    const option = allOptions[index];
    if (!option) return;
    setFocusedIndex(index);
    onUpdateQuestionState(questionText, {
      selectedValue: option.label
    }, false);
    onAnswer(questionText, option.label);
  }, [allOptions, questionText, onUpdateQuestionState, onAnswer]);
  const handleNavigate = useCallback((direction) => {
    if (isInNotesInput) return;
    let newIndex;
    if (typeof direction === "number") {
      newIndex = direction;
    } else if (direction === "up") {
      newIndex = focusedIndex > 0 ? focusedIndex - 1 : focusedIndex;
    } else {
      newIndex = focusedIndex < allOptions.length - 1 ? focusedIndex + 1 : focusedIndex;
    }
    if (newIndex >= 0 && newIndex < allOptions.length) {
      setFocusedIndex(newIndex);
    }
  }, [focusedIndex, allOptions.length, isInNotesInput]);
  useKeybinding("chat:externalEditor", async () => {
    const currentValue = questionState?.textInputValue || "";
    const result = await editPromptInEditor(currentValue);
    if (result.content !== null && result.content !== currentValue) {
      onUpdateQuestionState(questionText, {
        textInputValue: result.content
      }, false);
    }
  }, {
    context: "Chat",
    isActive: isInNotesInput && !!editor
  });
  useKeybindings({
    "tabs:previous": () => onTabPrev?.(),
    "tabs:next": () => onTabNext?.()
  }, {
    context: "Tabs",
    isActive: !isInNotesInput && !isFooterFocused
  });
  const handleNotesExit = useCallback(() => {
    setIsInNotesInput(false);
    onTextInputFocus(false);
    if (selectedValue) {
      onAnswer(questionText, selectedValue);
    }
  }, [selectedValue, questionText, onAnswer, onTextInputFocus]);
  const handleDownFromPreview = useCallback(() => {
    setIsFooterFocused(true);
  }, []);
  const handleUpFromFooter = useCallback(() => {
    setIsFooterFocused(false);
  }, []);
  const handleKeyDown = useCallback((e) => {
    if (isFooterFocused) {
      if (e.key === "up" || e.ctrl && e.key === "p") {
        e.preventDefault();
        if (footerIndex === 0) {
          handleUpFromFooter();
        } else {
          setFooterIndex(0);
        }
        return;
      }
      if (e.key === "down" || e.ctrl && e.key === "n") {
        e.preventDefault();
        if (isInPlanMode && footerIndex === 0) {
          setFooterIndex(1);
        }
        return;
      }
      if (e.key === "return") {
        e.preventDefault();
        if (footerIndex === 0) {
          onRespondToClaude();
        } else {
          onFinishPlanInterview();
        }
        return;
      }
      if (e.key === "escape") {
        e.preventDefault();
        onCancel();
      }
      return;
    }
    if (isInNotesInput) {
      if (e.key === "escape") {
        e.preventDefault();
        handleNotesExit();
      }
      return;
    }
    if (e.key === "up" || e.ctrl && e.key === "p") {
      e.preventDefault();
      if (focusedIndex > 0) {
        handleNavigate("up");
      }
    } else if (e.key === "down" || e.ctrl && e.key === "n") {
      e.preventDefault();
      if (focusedIndex === allOptions.length - 1) {
        handleDownFromPreview();
      } else {
        handleNavigate("down");
      }
    } else if (e.key === "return") {
      e.preventDefault();
      handleSelectOption(focusedIndex);
    } else if (e.key === "n" && !e.ctrl && !e.meta) {
      e.preventDefault();
      setIsInNotesInput(true);
      onTextInputFocus(true);
    } else if (e.key === "escape") {
      e.preventDefault();
      onCancel();
    } else if (e.key.length === 1 && e.key >= "1" && e.key <= "9") {
      e.preventDefault();
      const idx_0 = parseInt(e.key, 10) - 1;
      if (idx_0 < allOptions.length) {
        handleNavigate(idx_0);
      }
    }
  }, [isFooterFocused, footerIndex, isInPlanMode, isInNotesInput, focusedIndex, allOptions.length, handleUpFromFooter, handleDownFromPreview, handleNavigate, handleSelectOption, handleNotesExit, onRespondToClaude, onFinishPlanInterview, onCancel, onTextInputFocus]);
  const previewContent = focusedOption?.preview || null;
  const LEFT_PANEL_WIDTH = 30;
  const GAP = 4;
  const {
    columns
  } = useTerminalSize();
  const previewMaxWidth = columns - LEFT_PANEL_WIDTH - GAP;
  const PREVIEW_OVERHEAD = 11;
  const previewMaxLines = useMemo(() => {
    return minContentHeight ? Math.max(1, minContentHeight - PREVIEW_OVERHEAD) : void 0;
  }, [minContentHeight]);
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, tabIndex: 0, autoFocus: true, onKeyDown: handleKeyDown, children: [
    /* @__PURE__ */ jsx(Divider, { color: "inactive" }),
    /* @__PURE__ */ jsxs(Box, { flexDirection: "column", paddingTop: 0, children: [
      /* @__PURE__ */ jsx(QuestionNavigationBar, { questions, currentQuestionIndex, answers, hideSubmitTab }),
      /* @__PURE__ */ jsx(PermissionRequestTitle, { title: question.question, color: "text" }),
      /* @__PURE__ */ jsxs(Box, { flexDirection: "column", minHeight: minContentHeight, children: [
        /* @__PURE__ */ jsxs(Box, { marginTop: 1, flexDirection: "row", gap: 4, children: [
          /* @__PURE__ */ jsx(Box, { flexDirection: "column", width: 30, children: allOptions.map((option_0, index_0) => {
            const isFocused = focusedIndex === index_0;
            const isSelected = selectedValue === option_0.label;
            return /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
              isFocused ? /* @__PURE__ */ jsx(Text, { color: "suggestion", children: figures.pointer }) : /* @__PURE__ */ jsx(Text, { children: " " }),
              /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
                " ",
                index_0 + 1,
                "."
              ] }),
              /* @__PURE__ */ jsxs(Text, { color: isSelected ? "success" : isFocused ? "suggestion" : void 0, bold: isFocused, children: [
                " ",
                option_0.label
              ] }),
              isSelected && /* @__PURE__ */ jsxs(Text, { color: "success", children: [
                " ",
                figures.tick
              ] })
            ] }, option_0.label);
          }) }),
          /* @__PURE__ */ jsxs(Box, { flexDirection: "column", flexGrow: 1, children: [
            /* @__PURE__ */ jsx(PreviewBox, { content: previewContent || "No preview available", maxLines: previewMaxLines, minWidth: minContentWidth, maxWidth: previewMaxWidth }),
            /* @__PURE__ */ jsxs(Box, { marginTop: 1, flexDirection: "row", gap: 1, children: [
              /* @__PURE__ */ jsx(Text, { color: "suggestion", children: "Notes:" }),
              isInNotesInput ? /* @__PURE__ */ jsx(TextInput, { value: notesValue, placeholder: "Add notes on this design\u2026", onChange: (value) => {
                onUpdateQuestionState(questionText, {
                  textInputValue: value
                }, false);
              }, onSubmit: handleNotesExit, onExit: handleNotesExit, focus: true, showCursor: true, columns: 60, cursorOffset, onChangeCursorOffset: setCursorOffset }) : /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: notesValue || "press n to add notes" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
          /* @__PURE__ */ jsx(Divider, { color: "inactive" }),
          /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 1, children: [
            isFooterFocused && footerIndex === 0 ? /* @__PURE__ */ jsx(Text, { color: "suggestion", children: figures.pointer }) : /* @__PURE__ */ jsx(Text, { children: " " }),
            /* @__PURE__ */ jsx(Text, { color: isFooterFocused && footerIndex === 0 ? "suggestion" : void 0, children: "Chat about this" })
          ] }),
          isInPlanMode && /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 1, children: [
            isFooterFocused && footerIndex === 1 ? /* @__PURE__ */ jsx(Text, { color: "suggestion", children: figures.pointer }) : /* @__PURE__ */ jsx(Text, { children: " " }),
            /* @__PURE__ */ jsx(Text, { color: isFooterFocused && footerIndex === 1 ? "suggestion" : void 0, children: "Skip interview and plan immediately" })
          ] })
        ] }),
        /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { color: "inactive", dimColor: true, children: [
          "Enter to select \xB7 ",
          figures.arrowUp,
          "/",
          figures.arrowDown,
          " to navigate \xB7 n to add notes",
          questions.length > 1 && /* @__PURE__ */ jsx(Fragment, { children: " \xB7 Tab to switch questions" }),
          isInNotesInput && editorName && /* @__PURE__ */ jsxs(Fragment, { children: [
            " \xB7 ctrl+g to edit in ",
            editorName
          ] }),
          " ",
          "\xB7 Esc to cancel"
        ] }) })
      ] })
    ] })
  ] });
}
export {
  PreviewQuestionView
};
