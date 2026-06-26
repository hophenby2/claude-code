import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import figures from "figures";
import { useState } from "react";
import { Box, Text } from "../../ink.js";
import { AGENT_COLOR_TO_THEME_COLOR, AGENT_COLORS } from "../../tools/AgentTool/agentColorManager.js";
import { capitalize } from "../../utils/stringUtils.js";
const COLOR_OPTIONS = ["automatic", ...AGENT_COLORS];
function ColorPicker(t0) {
  const $ = _c(17);
  const {
    agentName,
    currentColor: t1,
    onConfirm
  } = t0;
  const currentColor = t1 === void 0 ? "automatic" : t1;
  let t2;
  if ($[0] !== currentColor) {
    t2 = COLOR_OPTIONS.findIndex((opt) => opt === currentColor);
    $[0] = currentColor;
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  const [selectedIndex, setSelectedIndex] = useState(Math.max(0, t2));
  let t3;
  if ($[2] !== onConfirm || $[3] !== selectedIndex) {
    t3 = (e) => {
      if (e.key === "up") {
        e.preventDefault();
        setSelectedIndex(_temp);
      } else {
        if (e.key === "down") {
          e.preventDefault();
          setSelectedIndex(_temp2);
        } else {
          if (e.key === "return") {
            e.preventDefault();
            const selected = COLOR_OPTIONS[selectedIndex];
            onConfirm(selected === "automatic" ? void 0 : selected);
          }
        }
      }
    };
    $[2] = onConfirm;
    $[3] = selectedIndex;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  const handleKeyDown = t3;
  const selectedValue = COLOR_OPTIONS[selectedIndex];
  let t4;
  if ($[5] !== selectedIndex) {
    t4 = COLOR_OPTIONS.map((option, index) => {
      const isSelected = index === selectedIndex;
      return /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 1, children: [
        /* @__PURE__ */ jsx(Text, { color: isSelected ? "suggestion" : void 0, children: isSelected ? figures.pointer : " " }),
        option === "automatic" ? /* @__PURE__ */ jsx(Text, { bold: isSelected, children: "Automatic color" }) : /* @__PURE__ */ jsxs(Box, { gap: 1, children: [
          /* @__PURE__ */ jsx(Text, { backgroundColor: AGENT_COLOR_TO_THEME_COLOR[option], color: "inverseText", children: " " }),
          /* @__PURE__ */ jsx(Text, { bold: isSelected, children: capitalize(option) })
        ] })
      ] }, option);
    });
    $[5] = selectedIndex;
    $[6] = t4;
  } else {
    t4 = $[6];
  }
  let t5;
  if ($[7] !== t4) {
    t5 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: t4 });
    $[7] = t4;
    $[8] = t5;
  } else {
    t5 = $[8];
  }
  let t6;
  if ($[9] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t6 = /* @__PURE__ */ jsx(Text, { children: "Preview: " });
    $[9] = t6;
  } else {
    t6 = $[9];
  }
  let t7;
  if ($[10] !== agentName || $[11] !== selectedValue) {
    t7 = /* @__PURE__ */ jsxs(Box, { marginTop: 1, children: [
      t6,
      selectedValue === void 0 || selectedValue === "automatic" ? /* @__PURE__ */ jsxs(Text, { inverse: true, bold: true, children: [
        " ",
        "@",
        agentName,
        " "
      ] }) : /* @__PURE__ */ jsxs(Text, { backgroundColor: AGENT_COLOR_TO_THEME_COLOR[selectedValue], color: "inverseText", bold: true, children: [
        " ",
        "@",
        agentName,
        " "
      ] })
    ] });
    $[10] = agentName;
    $[11] = selectedValue;
    $[12] = t7;
  } else {
    t7 = $[12];
  }
  let t8;
  if ($[13] !== handleKeyDown || $[14] !== t5 || $[15] !== t7) {
    t8 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, tabIndex: 0, autoFocus: true, onKeyDown: handleKeyDown, children: [
      t5,
      t7
    ] });
    $[13] = handleKeyDown;
    $[14] = t5;
    $[15] = t7;
    $[16] = t8;
  } else {
    t8 = $[16];
  }
  return t8;
}
function _temp2(prev_0) {
  return prev_0 < COLOR_OPTIONS.length - 1 ? prev_0 + 1 : 0;
}
function _temp(prev) {
  return prev > 0 ? prev - 1 : COLOR_OPTIONS.length - 1;
}
export {
  ColorPicker
};
