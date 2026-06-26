import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import figures from "figures";
import { Box, Text } from "../../../ink.js";
import { Select } from "../../CustomSelect/index.js";
import { Divider } from "../../design-system/Divider.js";
import { PermissionRequestTitle } from "../PermissionRequestTitle.js";
import { PermissionRuleExplanation } from "../PermissionRuleExplanation.js";
import { QuestionNavigationBar } from "./QuestionNavigationBar.js";
function SubmitQuestionsView(t0) {
  const $ = _c(27);
  const {
    questions,
    currentQuestionIndex,
    answers,
    allQuestionsAnswered,
    permissionResult,
    minContentHeight,
    onFinalResponse
  } = t0;
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = /* @__PURE__ */ jsx(Divider, { color: "inactive" });
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  let t2;
  if ($[1] !== answers || $[2] !== currentQuestionIndex || $[3] !== questions) {
    t2 = /* @__PURE__ */ jsx(QuestionNavigationBar, { questions, currentQuestionIndex, answers });
    $[1] = answers;
    $[2] = currentQuestionIndex;
    $[3] = questions;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  let t3;
  if ($[5] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t3 = /* @__PURE__ */ jsx(PermissionRequestTitle, { title: "Review your answers", color: "text" });
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  let t4;
  if ($[6] !== allQuestionsAnswered) {
    t4 = !allQuestionsAnswered && /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsxs(Text, { color: "warning", children: [
      figures.warning,
      " You have not answered all questions"
    ] }) });
    $[6] = allQuestionsAnswered;
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  let t5;
  if ($[8] !== answers || $[9] !== questions) {
    t5 = Object.keys(answers).length > 0 && /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginBottom: 1, children: questions.filter((q) => q?.question && answers[q.question]).map((q_0) => {
      const answer = answers[q_0?.question];
      return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginLeft: 1, children: [
        /* @__PURE__ */ jsxs(Text, { children: [
          figures.bullet,
          " ",
          q_0?.question || "Question"
        ] }),
        /* @__PURE__ */ jsx(Box, { marginLeft: 2, children: /* @__PURE__ */ jsxs(Text, { color: "success", children: [
          figures.arrowRight,
          " ",
          answer
        ] }) })
      ] }, q_0?.question || "answer");
    }) });
    $[8] = answers;
    $[9] = questions;
    $[10] = t5;
  } else {
    t5 = $[10];
  }
  let t6;
  if ($[11] !== permissionResult) {
    t6 = /* @__PURE__ */ jsx(PermissionRuleExplanation, { permissionResult, toolType: "tool" });
    $[11] = permissionResult;
    $[12] = t6;
  } else {
    t6 = $[12];
  }
  let t7;
  if ($[13] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t7 = /* @__PURE__ */ jsx(Text, { color: "inactive", children: "Ready to submit your answers?" });
    $[13] = t7;
  } else {
    t7 = $[13];
  }
  let t8;
  if ($[14] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t8 = {
      type: "text",
      label: "Submit answers",
      value: "submit"
    };
    $[14] = t8;
  } else {
    t8 = $[14];
  }
  let t9;
  if ($[15] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t9 = [t8, {
      type: "text",
      label: "Cancel",
      value: "cancel"
    }];
    $[15] = t9;
  } else {
    t9 = $[15];
  }
  let t10;
  if ($[16] !== onFinalResponse) {
    t10 = /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Select, { options: t9, onChange: (value) => onFinalResponse(value), onCancel: () => onFinalResponse("cancel") }) });
    $[16] = onFinalResponse;
    $[17] = t10;
  } else {
    t10 = $[17];
  }
  let t11;
  if ($[18] !== minContentHeight || $[19] !== t10 || $[20] !== t4 || $[21] !== t5 || $[22] !== t6) {
    t11 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, minHeight: minContentHeight, children: [
      t4,
      t5,
      t6,
      t7,
      t10
    ] });
    $[18] = minContentHeight;
    $[19] = t10;
    $[20] = t4;
    $[21] = t5;
    $[22] = t6;
    $[23] = t11;
  } else {
    t11 = $[23];
  }
  let t12;
  if ($[24] !== t11 || $[25] !== t2) {
    t12 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
      t1,
      /* @__PURE__ */ jsxs(Box, { flexDirection: "column", borderTop: true, borderColor: "inactive", paddingTop: 0, children: [
        t2,
        t3,
        t11
      ] })
    ] });
    $[24] = t11;
    $[25] = t2;
    $[26] = t12;
  } else {
    t12 = $[26];
  }
  return t12;
}
export {
  SubmitQuestionsView
};
