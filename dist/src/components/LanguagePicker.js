import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import figures from "figures";
import { useState } from "react";
import { Box, Text } from "../ink.js";
import { useKeybinding } from "../keybindings/useKeybinding.js";
import TextInput from "./TextInput.js";
function LanguagePicker(t0) {
  const $ = _c(13);
  const {
    initialLanguage,
    onComplete,
    onCancel
  } = t0;
  const [language, setLanguage] = useState(initialLanguage);
  const [cursorOffset, setCursorOffset] = useState((initialLanguage ?? "").length);
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = {
      context: "Settings"
    };
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  useKeybinding("confirm:no", onCancel, t1);
  let t2;
  if ($[1] !== language || $[2] !== onComplete) {
    t2 = function handleSubmit2() {
      const trimmed = language?.trim();
      onComplete(trimmed || void 0);
    };
    $[1] = language;
    $[2] = onComplete;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  const handleSubmit = t2;
  let t3;
  if ($[4] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t3 = /* @__PURE__ */ jsx(Text, { children: "Enter your preferred response and voice language:" });
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  let t4;
  if ($[5] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t4 = /* @__PURE__ */ jsx(Text, { children: figures.pointer });
    $[5] = t4;
  } else {
    t4 = $[5];
  }
  const t5 = language ?? "";
  let t6;
  if ($[6] !== cursorOffset || $[7] !== handleSubmit || $[8] !== t5) {
    t6 = /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 1, children: [
      t4,
      /* @__PURE__ */ jsx(TextInput, { value: t5, onChange: setLanguage, onSubmit: handleSubmit, focus: true, showCursor: true, placeholder: `e.g., Japanese, \u65E5\u672C\u8A9E, Espa\xF1ol${figures.ellipsis}`, columns: 60, cursorOffset, onChangeCursorOffset: setCursorOffset })
    ] });
    $[6] = cursorOffset;
    $[7] = handleSubmit;
    $[8] = t5;
    $[9] = t6;
  } else {
    t6 = $[9];
  }
  let t7;
  if ($[10] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t7 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Leave empty for default (English)" });
    $[10] = t7;
  } else {
    t7 = $[10];
  }
  let t8;
  if ($[11] !== t6) {
    t8 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
      t3,
      t6,
      t7
    ] });
    $[11] = t6;
    $[12] = t8;
  } else {
    t8 = $[12];
  }
  return t8;
}
export {
  LanguagePicker
};
