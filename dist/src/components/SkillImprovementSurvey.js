import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { useEffect, useRef } from "react";
import { BLACK_CIRCLE, BULLET_OPERATOR } from "../constants/figures.js";
import { Box, Text } from "../ink.js";
import { normalizeFullWidthDigits } from "../utils/stringUtils.js";
import { isValidResponseInput } from "./FeedbackSurvey/FeedbackSurveyView.js";
function SkillImprovementSurvey(t0) {
  const $ = _c(6);
  const {
    isOpen,
    skillName,
    updates,
    handleSelect,
    inputValue,
    setInputValue
  } = t0;
  if (!isOpen) {
    return null;
  }
  if (inputValue && !isValidResponseInput(inputValue)) {
    return null;
  }
  let t1;
  if ($[0] !== handleSelect || $[1] !== inputValue || $[2] !== setInputValue || $[3] !== skillName || $[4] !== updates) {
    t1 = /* @__PURE__ */ jsx(SkillImprovementSurveyView, { skillName, updates, onSelect: handleSelect, inputValue, setInputValue });
    $[0] = handleSelect;
    $[1] = inputValue;
    $[2] = setInputValue;
    $[3] = skillName;
    $[4] = updates;
    $[5] = t1;
  } else {
    t1 = $[5];
  }
  return t1;
}
const VALID_INPUTS = ["0", "1"];
function isValidInput(input) {
  return VALID_INPUTS.includes(input);
}
function SkillImprovementSurveyView(t0) {
  const $ = _c(17);
  const {
    skillName,
    updates,
    onSelect,
    inputValue,
    setInputValue
  } = t0;
  const initialInputValue = useRef(inputValue);
  let t1;
  let t2;
  if ($[0] !== inputValue || $[1] !== onSelect || $[2] !== setInputValue) {
    t1 = () => {
      if (inputValue !== initialInputValue.current) {
        const lastChar = normalizeFullWidthDigits(inputValue.slice(-1));
        if (isValidInput(lastChar)) {
          setInputValue(inputValue.slice(0, -1));
          onSelect(lastChar === "1" ? "good" : "dismissed");
        }
      }
    };
    t2 = [inputValue, onSelect, setInputValue];
    $[0] = inputValue;
    $[1] = onSelect;
    $[2] = setInputValue;
    $[3] = t1;
    $[4] = t2;
  } else {
    t1 = $[3];
    t2 = $[4];
  }
  useEffect(t1, t2);
  let t3;
  if ($[5] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t3 = /* @__PURE__ */ jsxs(Text, { color: "ansi:cyan", children: [
      BLACK_CIRCLE,
      " "
    ] });
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  let t4;
  if ($[6] !== skillName) {
    t4 = /* @__PURE__ */ jsxs(Box, { children: [
      t3,
      /* @__PURE__ */ jsxs(Text, { bold: true, children: [
        'Skill improvement suggested for "',
        skillName,
        '"'
      ] })
    ] });
    $[6] = skillName;
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  let t5;
  if ($[8] !== updates) {
    t5 = updates.map(_temp);
    $[8] = updates;
    $[9] = t5;
  } else {
    t5 = $[9];
  }
  let t6;
  if ($[10] !== t5) {
    t6 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginLeft: 2, children: t5 });
    $[10] = t5;
    $[11] = t6;
  } else {
    t6 = $[11];
  }
  let t7;
  if ($[12] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t7 = /* @__PURE__ */ jsx(Box, { width: 12, children: /* @__PURE__ */ jsxs(Text, { children: [
      /* @__PURE__ */ jsx(Text, { color: "ansi:cyan", children: "1" }),
      ": Apply"
    ] }) });
    $[12] = t7;
  } else {
    t7 = $[12];
  }
  let t8;
  if ($[13] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t8 = /* @__PURE__ */ jsxs(Box, { marginLeft: 2, marginTop: 1, children: [
      t7,
      /* @__PURE__ */ jsx(Box, { width: 14, children: /* @__PURE__ */ jsxs(Text, { children: [
        /* @__PURE__ */ jsx(Text, { color: "ansi:cyan", children: "0" }),
        ": Dismiss"
      ] }) })
    ] });
    $[13] = t8;
  } else {
    t8 = $[13];
  }
  let t9;
  if ($[14] !== t4 || $[15] !== t6) {
    t9 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
      t4,
      t6,
      t8
    ] });
    $[14] = t4;
    $[15] = t6;
    $[16] = t9;
  } else {
    t9 = $[16];
  }
  return t9;
}
function _temp(u, i) {
  return /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
    BULLET_OPERATOR,
    " ",
    u.change
  ] }, i);
}
export {
  SkillImprovementSurvey
};
