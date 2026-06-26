import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import chalk from "chalk";
import { LIGHTNING_BOLT } from "../constants/figures.js";
import { Text } from "../ink.js";
import { getGlobalConfig } from "../utils/config.js";
import { resolveThemeSetting } from "../utils/systemTheme.js";
import { color } from "./design-system/color.js";
function FastIcon(t0) {
  const $ = _c(2);
  const {
    cooldown
  } = t0;
  if (cooldown) {
    let t12;
    if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t12 = /* @__PURE__ */ jsx(Text, { color: "promptBorder", dimColor: true, children: LIGHTNING_BOLT });
      $[0] = t12;
    } else {
      t12 = $[0];
    }
    return t12;
  }
  let t1;
  if ($[1] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = /* @__PURE__ */ jsx(Text, { color: "fastMode", children: LIGHTNING_BOLT });
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}
function getFastIconString(applyColor = true, cooldown = false) {
  if (!applyColor) {
    return LIGHTNING_BOLT;
  }
  const themeName = resolveThemeSetting(getGlobalConfig().theme);
  if (cooldown) {
    return chalk.dim(color("promptBorder", themeName)(LIGHTNING_BOLT));
  }
  return color("fastMode", themeName)(LIGHTNING_BOLT);
}
export {
  FastIcon,
  getFastIconString
};
