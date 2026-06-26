import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { useTerminalSize } from "../../hooks/useTerminalSize.js";
import { stringWidth } from "../../ink/stringWidth.js";
import { Ansi, Text } from "../../ink.js";
function Divider(t0) {
  const $ = _c(21);
  const {
    width,
    color,
    char: t1,
    padding: t2,
    title
  } = t0;
  const char = t1 === void 0 ? "\u2500" : t1;
  const padding = t2 === void 0 ? 0 : t2;
  const {
    columns: terminalWidth
  } = useTerminalSize();
  const effectiveWidth = Math.max(0, (width ?? terminalWidth) - padding);
  if (title) {
    const titleWidth = stringWidth(title) + 2;
    const sideWidth = Math.max(0, effectiveWidth - titleWidth);
    const leftWidth = Math.floor(sideWidth / 2);
    const rightWidth = sideWidth - leftWidth;
    const t32 = !color;
    let t42;
    if ($[0] !== char || $[1] !== leftWidth) {
      t42 = char.repeat(leftWidth);
      $[0] = char;
      $[1] = leftWidth;
      $[2] = t42;
    } else {
      t42 = $[2];
    }
    let t52;
    if ($[3] !== title) {
      t52 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsx(Ansi, { children: title }) });
      $[3] = title;
      $[4] = t52;
    } else {
      t52 = $[4];
    }
    let t6;
    if ($[5] !== char || $[6] !== rightWidth) {
      t6 = char.repeat(rightWidth);
      $[5] = char;
      $[6] = rightWidth;
      $[7] = t6;
    } else {
      t6 = $[7];
    }
    let t7;
    if ($[8] !== color || $[9] !== t32 || $[10] !== t42 || $[11] !== t52 || $[12] !== t6) {
      t7 = /* @__PURE__ */ jsxs(Text, { color, dimColor: t32, children: [
        t42,
        " ",
        t52,
        " ",
        t6
      ] });
      $[8] = color;
      $[9] = t32;
      $[10] = t42;
      $[11] = t52;
      $[12] = t6;
      $[13] = t7;
    } else {
      t7 = $[13];
    }
    return t7;
  }
  const t3 = !color;
  let t4;
  if ($[14] !== char || $[15] !== effectiveWidth) {
    t4 = char.repeat(effectiveWidth);
    $[14] = char;
    $[15] = effectiveWidth;
    $[16] = t4;
  } else {
    t4 = $[16];
  }
  let t5;
  if ($[17] !== color || $[18] !== t3 || $[19] !== t4) {
    t5 = /* @__PURE__ */ jsx(Text, { color, dimColor: t3, children: t4 });
    $[17] = color;
    $[18] = t3;
    $[19] = t4;
    $[20] = t5;
  } else {
    t5 = $[20];
  }
  return t5;
}
export {
  Divider
};
