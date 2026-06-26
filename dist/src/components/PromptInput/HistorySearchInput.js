import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { stringWidth } from "../../ink/stringWidth.js";
import { Box, Text } from "../../ink.js";
import TextInput from "../TextInput.js";
function HistorySearchInput(t0) {
  const $ = _c(9);
  const {
    value,
    onChange,
    historyFailedMatch
  } = t0;
  const t1 = historyFailedMatch ? "no matching prompt:" : "search prompts:";
  let t2;
  if ($[0] !== t1) {
    t2 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: t1 });
    $[0] = t1;
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  const t3 = stringWidth(value) + 1;
  let t4;
  if ($[2] !== onChange || $[3] !== t3 || $[4] !== value) {
    t4 = /* @__PURE__ */ jsx(TextInput, { value, onChange, cursorOffset: value.length, onChangeCursorOffset: _temp, columns: t3, focus: true, showCursor: true, multiline: false, dimColor: true });
    $[2] = onChange;
    $[3] = t3;
    $[4] = value;
    $[5] = t4;
  } else {
    t4 = $[5];
  }
  let t5;
  if ($[6] !== t2 || $[7] !== t4) {
    t5 = /* @__PURE__ */ jsxs(Box, { gap: 1, children: [
      t2,
      t4
    ] });
    $[6] = t2;
    $[7] = t4;
    $[8] = t5;
  } else {
    t5 = $[8];
  }
  return t5;
}
function _temp() {
}
var HistorySearchInput_default = HistorySearchInput;
export {
  HistorySearchInput_default as default
};
