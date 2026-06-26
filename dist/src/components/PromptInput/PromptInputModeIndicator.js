import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import figures from "figures";
import { Box, Text } from "../../ink.js";
import { AGENT_COLOR_TO_THEME_COLOR, AGENT_COLORS } from "../../tools/AgentTool/agentColorManager.js";
import { getTeammateColor } from "../../utils/teammate.js";
import { isAgentSwarmsEnabled } from "../../utils/agentSwarmsEnabled.js";
function getTeammateThemeColor() {
  if (!isAgentSwarmsEnabled()) {
    return void 0;
  }
  const colorName = getTeammateColor();
  if (!colorName) {
    return void 0;
  }
  if (AGENT_COLORS.includes(colorName)) {
    return AGENT_COLOR_TO_THEME_COLOR[colorName];
  }
  return void 0;
}
function PromptChar(t0) {
  const $ = _c(3);
  const {
    isLoading,
    themeColor
  } = t0;
  const teammateColor = themeColor;
  const color = teammateColor ?? (false ? "subtle" : void 0);
  let t1;
  if ($[0] !== color || $[1] !== isLoading) {
    t1 = /* @__PURE__ */ jsxs(Text, { color, dimColor: isLoading, children: [
      figures.pointer,
      "\xA0"
    ] });
    $[0] = color;
    $[1] = isLoading;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  return t1;
}
function PromptInputModeIndicator(t0) {
  const $ = _c(6);
  const {
    mode,
    isLoading,
    viewingAgentName,
    viewingAgentColor
  } = t0;
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = getTeammateThemeColor();
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const teammateColor = t1;
  const viewedTeammateThemeColor = viewingAgentColor ? AGENT_COLOR_TO_THEME_COLOR[viewingAgentColor] : void 0;
  let t2;
  if ($[1] !== isLoading || $[2] !== mode || $[3] !== viewedTeammateThemeColor || $[4] !== viewingAgentName) {
    t2 = /* @__PURE__ */ jsx(Box, { alignItems: "flex-start", alignSelf: "flex-start", flexWrap: "nowrap", justifyContent: "flex-start", children: viewingAgentName ? /* @__PURE__ */ jsx(PromptChar, { isLoading, themeColor: viewedTeammateThemeColor }) : mode === "bash" ? /* @__PURE__ */ jsx(Text, { color: "bashBorder", dimColor: isLoading, children: "!\xA0" }) : /* @__PURE__ */ jsx(PromptChar, { isLoading, themeColor: isAgentSwarmsEnabled() ? teammateColor : void 0 }) });
    $[1] = isLoading;
    $[2] = mode;
    $[3] = viewedTeammateThemeColor;
    $[4] = viewingAgentName;
    $[5] = t2;
  } else {
    t2 = $[5];
  }
  return t2;
}
export {
  PromptInputModeIndicator
};
