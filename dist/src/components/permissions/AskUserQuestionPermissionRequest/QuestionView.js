import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import figures from "figures";
import { useState } from "react";
import { Box, Text } from "../../../ink.js";
import { useAppState } from "../../../state/AppState.js";
import { getExternalEditor } from "../../../utils/editor.js";
import { toIDEDisplayName } from "../../../utils/ide.js";
import { editPromptInEditor } from "../../../utils/promptEditor.js";
import { Select, SelectMulti } from "../../CustomSelect/index.js";
import { Divider } from "../../design-system/Divider.js";
import { FilePathLink } from "../../FilePathLink.js";
import { PermissionRequestTitle } from "../PermissionRequestTitle.js";
import { PreviewQuestionView } from "./PreviewQuestionView.js";
import { QuestionNavigationBar } from "./QuestionNavigationBar.js";
function QuestionView(t0) {
  const $ = _c(114);
  const {
    question,
    questions,
    currentQuestionIndex,
    answers,
    questionStates,
    hideSubmitTab: t1,
    planFilePath,
    minContentHeight,
    minContentWidth,
    onUpdateQuestionState,
    onAnswer,
    onTextInputFocus,
    onCancel,
    onSubmit,
    onTabPrev,
    onTabNext,
    onRespondToClaude,
    onFinishPlanInterview,
    onImagePaste,
    pastedContents,
    onRemoveImage
  } = t0;
  const hideSubmitTab = t1 === void 0 ? false : t1;
  const isInPlanMode = useAppState(_temp) === "plan";
  const [isFooterFocused, setIsFooterFocused] = useState(false);
  const [footerIndex, setFooterIndex] = useState(0);
  const [isOtherFocused, setIsOtherFocused] = useState(false);
  let t2;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    const editor = getExternalEditor();
    t2 = editor ? toIDEDisplayName(editor) : null;
    $[0] = t2;
  } else {
    t2 = $[0];
  }
  const editorName = t2;
  let t3;
  if ($[1] !== onTextInputFocus) {
    t3 = (value) => {
      const isOther = value === "__other__";
      setIsOtherFocused(isOther);
      onTextInputFocus(isOther);
    };
    $[1] = onTextInputFocus;
    $[2] = t3;
  } else {
    t3 = $[2];
  }
  const handleFocus = t3;
  let t4;
  if ($[3] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t4 = () => {
      setIsFooterFocused(true);
    };
    $[3] = t4;
  } else {
    t4 = $[3];
  }
  const handleDownFromLastItem = t4;
  let t5;
  if ($[4] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t5 = () => {
      setIsFooterFocused(false);
    };
    $[4] = t5;
  } else {
    t5 = $[4];
  }
  const handleUpFromFooter = t5;
  let t6;
  if ($[5] !== footerIndex || $[6] !== isFooterFocused || $[7] !== isInPlanMode || $[8] !== onCancel || $[9] !== onFinishPlanInterview || $[10] !== onRespondToClaude) {
    t6 = (e) => {
      if (!isFooterFocused) {
        return;
      }
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
    };
    $[5] = footerIndex;
    $[6] = isFooterFocused;
    $[7] = isInPlanMode;
    $[8] = onCancel;
    $[9] = onFinishPlanInterview;
    $[10] = onRespondToClaude;
    $[11] = t6;
  } else {
    t6 = $[11];
  }
  const handleKeyDown = t6;
  let handleOpenEditor;
  let questionText;
  let t7;
  if ($[12] !== onUpdateQuestionState || $[13] !== question || $[14] !== questionStates) {
    const textOptions = question.options.map(_temp2);
    questionText = question.question;
    const questionState = questionStates[questionText];
    let t82;
    if ($[18] !== onUpdateQuestionState || $[19] !== question.multiSelect || $[20] !== questionText) {
      t82 = async (currentValue, setValue) => {
        const result = await editPromptInEditor(currentValue);
        if (result.content !== null && result.content !== currentValue) {
          setValue(result.content);
          onUpdateQuestionState(questionText, {
            textInputValue: result.content
          }, question.multiSelect ?? false);
        }
      };
      $[18] = onUpdateQuestionState;
      $[19] = question.multiSelect;
      $[20] = questionText;
      $[21] = t82;
    } else {
      t82 = $[21];
    }
    handleOpenEditor = t82;
    const t92 = question.multiSelect ? "Type something" : "Type something.";
    const t102 = questionState?.textInputValue ?? "";
    let t112;
    if ($[22] !== onUpdateQuestionState || $[23] !== question.multiSelect || $[24] !== questionText) {
      t112 = (value_0) => {
        onUpdateQuestionState(questionText, {
          textInputValue: value_0
        }, question.multiSelect ?? false);
      };
      $[22] = onUpdateQuestionState;
      $[23] = question.multiSelect;
      $[24] = questionText;
      $[25] = t112;
    } else {
      t112 = $[25];
    }
    let t122;
    if ($[26] !== t102 || $[27] !== t112 || $[28] !== t92) {
      t122 = {
        type: "input",
        value: "__other__",
        label: "Other",
        placeholder: t92,
        initialValue: t102,
        onChange: t112
      };
      $[26] = t102;
      $[27] = t112;
      $[28] = t92;
      $[29] = t122;
    } else {
      t122 = $[29];
    }
    const otherOption = t122;
    t7 = [...textOptions, otherOption];
    $[12] = onUpdateQuestionState;
    $[13] = question;
    $[14] = questionStates;
    $[15] = handleOpenEditor;
    $[16] = questionText;
    $[17] = t7;
  } else {
    handleOpenEditor = $[15];
    questionText = $[16];
    t7 = $[17];
  }
  const options = t7;
  const hasAnyPreview = !question.multiSelect && question.options.some(_temp3);
  if (hasAnyPreview) {
    let t82;
    if ($[30] !== answers || $[31] !== currentQuestionIndex || $[32] !== hideSubmitTab || $[33] !== minContentHeight || $[34] !== minContentWidth || $[35] !== onAnswer || $[36] !== onCancel || $[37] !== onFinishPlanInterview || $[38] !== onRespondToClaude || $[39] !== onTabNext || $[40] !== onTabPrev || $[41] !== onTextInputFocus || $[42] !== onUpdateQuestionState || $[43] !== question || $[44] !== questionStates || $[45] !== questions) {
      t82 = /* @__PURE__ */ jsx(PreviewQuestionView, { question, questions, currentQuestionIndex, answers, questionStates, hideSubmitTab, minContentHeight, minContentWidth, onUpdateQuestionState, onAnswer, onTextInputFocus, onCancel, onTabPrev, onTabNext, onRespondToClaude, onFinishPlanInterview });
      $[30] = answers;
      $[31] = currentQuestionIndex;
      $[32] = hideSubmitTab;
      $[33] = minContentHeight;
      $[34] = minContentWidth;
      $[35] = onAnswer;
      $[36] = onCancel;
      $[37] = onFinishPlanInterview;
      $[38] = onRespondToClaude;
      $[39] = onTabNext;
      $[40] = onTabPrev;
      $[41] = onTextInputFocus;
      $[42] = onUpdateQuestionState;
      $[43] = question;
      $[44] = questionStates;
      $[45] = questions;
      $[46] = t82;
    } else {
      t82 = $[46];
    }
    return t82;
  }
  let t8;
  if ($[47] !== isInPlanMode || $[48] !== planFilePath) {
    t8 = isInPlanMode && planFilePath && /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 0, children: [
      /* @__PURE__ */ jsx(Divider, { color: "inactive" }),
      /* @__PURE__ */ jsxs(Text, { color: "inactive", children: [
        "Planning: ",
        /* @__PURE__ */ jsx(FilePathLink, { filePath: planFilePath })
      ] })
    ] });
    $[47] = isInPlanMode;
    $[48] = planFilePath;
    $[49] = t8;
  } else {
    t8 = $[49];
  }
  let t9;
  if ($[50] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t9 = /* @__PURE__ */ jsx(Box, { marginTop: -1, children: /* @__PURE__ */ jsx(Divider, { color: "inactive" }) });
    $[50] = t9;
  } else {
    t9 = $[50];
  }
  let t10;
  if ($[51] !== answers || $[52] !== currentQuestionIndex || $[53] !== hideSubmitTab || $[54] !== questions) {
    t10 = /* @__PURE__ */ jsx(QuestionNavigationBar, { questions, currentQuestionIndex, answers, hideSubmitTab });
    $[51] = answers;
    $[52] = currentQuestionIndex;
    $[53] = hideSubmitTab;
    $[54] = questions;
    $[55] = t10;
  } else {
    t10 = $[55];
  }
  let t11;
  if ($[56] !== question.question) {
    t11 = /* @__PURE__ */ jsx(PermissionRequestTitle, { title: question.question, color: "text" });
    $[56] = question.question;
    $[57] = t11;
  } else {
    t11 = $[57];
  }
  let t12;
  if ($[58] !== currentQuestionIndex || $[59] !== handleFocus || $[60] !== handleOpenEditor || $[61] !== isFooterFocused || $[62] !== onAnswer || $[63] !== onCancel || $[64] !== onImagePaste || $[65] !== onRemoveImage || $[66] !== onSubmit || $[67] !== onUpdateQuestionState || $[68] !== options || $[69] !== pastedContents || $[70] !== question.multiSelect || $[71] !== question.question || $[72] !== questionStates || $[73] !== questionText || $[74] !== questions.length) {
    t12 = /* @__PURE__ */ jsx(Box, { marginTop: 1, children: question.multiSelect ? /* @__PURE__ */ jsx(SelectMulti, { options, defaultValue: questionStates[question.question]?.selectedValue, onChange: (values) => {
      onUpdateQuestionState(questionText, {
        selectedValue: values
      }, true);
      const textInput = values.includes("__other__") ? questionStates[questionText]?.textInputValue : void 0;
      const finalValues = values.filter(_temp4).concat(textInput ? [textInput] : []);
      onAnswer(questionText, finalValues, void 0, false);
    }, onFocus: handleFocus, onCancel, submitButtonText: currentQuestionIndex === questions.length - 1 ? "Submit" : "Next", onSubmit, onDownFromLastItem: handleDownFromLastItem, isDisabled: isFooterFocused, onOpenEditor: handleOpenEditor, onImagePaste, pastedContents, onRemoveImage }, question.question) : /* @__PURE__ */ jsx(Select, { options, defaultValue: questionStates[question.question]?.selectedValue, onChange: (value_1) => {
      onUpdateQuestionState(questionText, {
        selectedValue: value_1
      }, false);
      const textInput_0 = value_1 === "__other__" ? questionStates[questionText]?.textInputValue : void 0;
      onAnswer(questionText, value_1, textInput_0);
    }, onFocus: handleFocus, onCancel, onDownFromLastItem: handleDownFromLastItem, isDisabled: isFooterFocused, layout: "compact-vertical", onOpenEditor: handleOpenEditor, onImagePaste, pastedContents, onRemoveImage }, question.question) });
    $[58] = currentQuestionIndex;
    $[59] = handleFocus;
    $[60] = handleOpenEditor;
    $[61] = isFooterFocused;
    $[62] = onAnswer;
    $[63] = onCancel;
    $[64] = onImagePaste;
    $[65] = onRemoveImage;
    $[66] = onSubmit;
    $[67] = onUpdateQuestionState;
    $[68] = options;
    $[69] = pastedContents;
    $[70] = question.multiSelect;
    $[71] = question.question;
    $[72] = questionStates;
    $[73] = questionText;
    $[74] = questions.length;
    $[75] = t12;
  } else {
    t12 = $[75];
  }
  let t13;
  if ($[76] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t13 = /* @__PURE__ */ jsx(Divider, { color: "inactive" });
    $[76] = t13;
  } else {
    t13 = $[76];
  }
  let t14;
  if ($[77] !== footerIndex || $[78] !== isFooterFocused) {
    t14 = isFooterFocused && footerIndex === 0 ? /* @__PURE__ */ jsx(Text, { color: "suggestion", children: figures.pointer }) : /* @__PURE__ */ jsx(Text, { children: " " });
    $[77] = footerIndex;
    $[78] = isFooterFocused;
    $[79] = t14;
  } else {
    t14 = $[79];
  }
  const t15 = isFooterFocused && footerIndex === 0 ? "suggestion" : void 0;
  const t16 = options.length + 1;
  let t17;
  if ($[80] !== t15 || $[81] !== t16) {
    t17 = /* @__PURE__ */ jsxs(Text, { color: t15, children: [
      t16,
      ". Chat about this"
    ] });
    $[80] = t15;
    $[81] = t16;
    $[82] = t17;
  } else {
    t17 = $[82];
  }
  let t18;
  if ($[83] !== t14 || $[84] !== t17) {
    t18 = /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 1, children: [
      t14,
      t17
    ] });
    $[83] = t14;
    $[84] = t17;
    $[85] = t18;
  } else {
    t18 = $[85];
  }
  let t19;
  if ($[86] !== footerIndex || $[87] !== isFooterFocused || $[88] !== isInPlanMode || $[89] !== options.length) {
    t19 = isInPlanMode && /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 1, children: [
      isFooterFocused && footerIndex === 1 ? /* @__PURE__ */ jsx(Text, { color: "suggestion", children: figures.pointer }) : /* @__PURE__ */ jsx(Text, { children: " " }),
      /* @__PURE__ */ jsxs(Text, { color: isFooterFocused && footerIndex === 1 ? "suggestion" : void 0, children: [
        options.length + 2,
        ". Skip interview and plan immediately"
      ] })
    ] });
    $[86] = footerIndex;
    $[87] = isFooterFocused;
    $[88] = isInPlanMode;
    $[89] = options.length;
    $[90] = t19;
  } else {
    t19 = $[90];
  }
  let t20;
  if ($[91] !== t18 || $[92] !== t19) {
    t20 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      t13,
      t18,
      t19
    ] });
    $[91] = t18;
    $[92] = t19;
    $[93] = t20;
  } else {
    t20 = $[93];
  }
  let t21;
  if ($[94] !== questions.length) {
    t21 = questions.length === 1 ? /* @__PURE__ */ jsxs(Fragment, { children: [
      figures.arrowUp,
      "/",
      figures.arrowDown,
      " to navigate"
    ] }) : "Tab/Arrow keys to navigate";
    $[94] = questions.length;
    $[95] = t21;
  } else {
    t21 = $[95];
  }
  let t22;
  if ($[96] !== isOtherFocused) {
    t22 = isOtherFocused && editorName && /* @__PURE__ */ jsxs(Fragment, { children: [
      " \xB7 ctrl+g to edit in ",
      editorName
    ] });
    $[96] = isOtherFocused;
    $[97] = t22;
  } else {
    t22 = $[97];
  }
  let t23;
  if ($[98] !== t21 || $[99] !== t22) {
    t23 = /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { color: "inactive", dimColor: true, children: [
      "Enter to select \xB7",
      " ",
      t21,
      t22,
      " ",
      "\xB7 Esc to cancel"
    ] }) });
    $[98] = t21;
    $[99] = t22;
    $[100] = t23;
  } else {
    t23 = $[100];
  }
  let t24;
  if ($[101] !== minContentHeight || $[102] !== t12 || $[103] !== t20 || $[104] !== t23) {
    t24 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", minHeight: minContentHeight, children: [
      t12,
      t20,
      t23
    ] });
    $[101] = minContentHeight;
    $[102] = t12;
    $[103] = t20;
    $[104] = t23;
    $[105] = t24;
  } else {
    t24 = $[105];
  }
  let t25;
  if ($[106] !== t10 || $[107] !== t11 || $[108] !== t24) {
    t25 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", paddingTop: 0, children: [
      t10,
      t11,
      t24
    ] });
    $[106] = t10;
    $[107] = t11;
    $[108] = t24;
    $[109] = t25;
  } else {
    t25 = $[109];
  }
  let t26;
  if ($[110] !== handleKeyDown || $[111] !== t25 || $[112] !== t8) {
    t26 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 0, tabIndex: 0, autoFocus: true, onKeyDown: handleKeyDown, children: [
      t8,
      t9,
      t25
    ] });
    $[110] = handleKeyDown;
    $[111] = t25;
    $[112] = t8;
    $[113] = t26;
  } else {
    t26 = $[113];
  }
  return t26;
}
function _temp4(v) {
  return v !== "__other__";
}
function _temp3(opt_0) {
  return opt_0.preview;
}
function _temp2(opt) {
  return {
    type: "text",
    value: opt.label,
    label: opt.label,
    description: opt.description
  };
}
function _temp(s) {
  return s.toolPermissionContext.mode;
}
export {
  QuestionView
};
