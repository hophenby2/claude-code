import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Suspense, use } from "react";
import { useSettings } from "../../../hooks/useSettings.js";
import { useTerminalSize } from "../../../hooks/useTerminalSize.js";
import { stringWidth } from "../../../ink/stringWidth.js";
import { Ansi, Box, Text, useTheme } from "../../../ink.js";
import { getCliHighlightPromise } from "../../../utils/cliHighlight.js";
import { applyMarkdown } from "../../../utils/markdown.js";
import sliceAnsi from "../../../utils/sliceAnsi.js";
const BOX_CHARS = {
  topLeft: "\u250C",
  topRight: "\u2510",
  bottomLeft: "\u2514",
  bottomRight: "\u2518",
  horizontal: "\u2500",
  vertical: "\u2502",
  teeLeft: "\u251C",
  teeRight: "\u2524"
};
function PreviewBox(props) {
  const $ = _c(4);
  const settings = useSettings();
  if (settings.syntaxHighlightingDisabled) {
    let t02;
    if ($[0] !== props) {
      t02 = /* @__PURE__ */ jsx(PreviewBoxBody, { ...props, highlight: null });
      $[0] = props;
      $[1] = t02;
    } else {
      t02 = $[1];
    }
    return t02;
  }
  let t0;
  if ($[2] !== props) {
    t0 = /* @__PURE__ */ jsx(Suspense, { fallback: /* @__PURE__ */ jsx(PreviewBoxBody, { ...props, highlight: null }), children: /* @__PURE__ */ jsx(PreviewBoxWithHighlight, { ...props }) });
    $[2] = props;
    $[3] = t0;
  } else {
    t0 = $[3];
  }
  return t0;
}
function PreviewBoxWithHighlight(props) {
  const $ = _c(4);
  let t0;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t0 = getCliHighlightPromise();
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const highlight = use(t0);
  let t1;
  if ($[1] !== highlight || $[2] !== props) {
    t1 = /* @__PURE__ */ jsx(PreviewBoxBody, { ...props, highlight });
    $[1] = highlight;
    $[2] = props;
    $[3] = t1;
  } else {
    t1 = $[3];
  }
  return t1;
}
function PreviewBoxBody(t0) {
  const $ = _c(34);
  const {
    content,
    maxLines,
    minHeight,
    minWidth: t1,
    maxWidth,
    highlight
  } = t0;
  const minWidth = t1 === void 0 ? 40 : t1;
  const {
    columns: terminalWidth
  } = useTerminalSize();
  const [theme] = useTheme();
  const effectiveMaxWidth = maxWidth ?? terminalWidth - 4;
  const effectiveMaxLines = maxLines ?? 20;
  let t2;
  if ($[0] !== content || $[1] !== highlight || $[2] !== theme) {
    t2 = applyMarkdown(content, theme, highlight);
    $[0] = content;
    $[1] = highlight;
    $[2] = theme;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  const rendered = t2;
  let T0;
  let bottomBorder;
  let t3;
  let t4;
  let t5;
  let truncationBar;
  if ($[4] !== effectiveMaxLines || $[5] !== effectiveMaxWidth || $[6] !== minHeight || $[7] !== minWidth || $[8] !== rendered) {
    const contentLines = rendered.split("\n");
    const isTruncated = contentLines.length > effectiveMaxLines;
    const truncatedLines = isTruncated ? contentLines.slice(0, effectiveMaxLines) : contentLines;
    const effectiveMinHeight = Math.min(minHeight ?? 0, effectiveMaxLines);
    const paddingNeeded = Math.max(0, effectiveMinHeight - truncatedLines.length - (isTruncated ? 1 : 0));
    const lines = paddingNeeded > 0 ? [...truncatedLines, ...Array(paddingNeeded).fill("")] : truncatedLines;
    const contentWidth = Math.max(minWidth, ...lines.map(_temp));
    const boxWidth = Math.min(contentWidth + 4, effectiveMaxWidth);
    const innerWidth = boxWidth - 4;
    let t62;
    if ($[15] !== boxWidth) {
      t62 = BOX_CHARS.horizontal.repeat(boxWidth - 2);
      $[15] = boxWidth;
      $[16] = t62;
    } else {
      t62 = $[16];
    }
    const topBorder = `${BOX_CHARS.topLeft}${t62}${BOX_CHARS.topRight}`;
    let t72;
    if ($[17] !== boxWidth) {
      t72 = BOX_CHARS.horizontal.repeat(boxWidth - 2);
      $[17] = boxWidth;
      $[18] = t72;
    } else {
      t72 = $[18];
    }
    bottomBorder = `${BOX_CHARS.bottomLeft}${t72}${BOX_CHARS.bottomRight}`;
    truncationBar = isTruncated ? (() => {
      const hiddenCount = contentLines.length - effectiveMaxLines;
      const label = `${BOX_CHARS.horizontal.repeat(3)} \u2702 ${BOX_CHARS.horizontal.repeat(3)} ${hiddenCount} lines hidden `;
      const labelWidth = stringWidth(label);
      const fillWidth = Math.max(0, boxWidth - 2 - labelWidth);
      return `${BOX_CHARS.teeLeft}${label}${BOX_CHARS.horizontal.repeat(fillWidth)}${BOX_CHARS.teeRight}`;
    })() : null;
    T0 = Box;
    t3 = "column";
    if ($[19] !== topBorder) {
      t4 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: topBorder });
      $[19] = topBorder;
      $[20] = t4;
    } else {
      t4 = $[20];
    }
    let t82;
    if ($[21] !== innerWidth) {
      t82 = (line_0, index) => {
        const lineWidth = stringWidth(line_0);
        const displayLine = lineWidth > innerWidth ? sliceAnsi(line_0, 0, innerWidth) : line_0;
        const padding = " ".repeat(Math.max(0, innerWidth - stringWidth(displayLine)));
        return /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
          /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
            BOX_CHARS.vertical,
            " "
          ] }),
          /* @__PURE__ */ jsx(Ansi, { children: displayLine }),
          /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
            padding,
            " ",
            BOX_CHARS.vertical
          ] })
        ] }, index);
      };
      $[21] = innerWidth;
      $[22] = t82;
    } else {
      t82 = $[22];
    }
    t5 = lines.map(t82);
    $[4] = effectiveMaxLines;
    $[5] = effectiveMaxWidth;
    $[6] = minHeight;
    $[7] = minWidth;
    $[8] = rendered;
    $[9] = T0;
    $[10] = bottomBorder;
    $[11] = t3;
    $[12] = t4;
    $[13] = t5;
    $[14] = truncationBar;
  } else {
    T0 = $[9];
    bottomBorder = $[10];
    t3 = $[11];
    t4 = $[12];
    t5 = $[13];
    truncationBar = $[14];
  }
  let t6;
  if ($[23] !== truncationBar) {
    t6 = truncationBar && /* @__PURE__ */ jsx(Text, { color: "warning", children: truncationBar });
    $[23] = truncationBar;
    $[24] = t6;
  } else {
    t6 = $[24];
  }
  let t7;
  if ($[25] !== bottomBorder) {
    t7 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: bottomBorder });
    $[25] = bottomBorder;
    $[26] = t7;
  } else {
    t7 = $[26];
  }
  let t8;
  if ($[27] !== T0 || $[28] !== t3 || $[29] !== t4 || $[30] !== t5 || $[31] !== t6 || $[32] !== t7) {
    t8 = /* @__PURE__ */ jsxs(T0, { flexDirection: t3, children: [
      t4,
      t5,
      t6,
      t7
    ] });
    $[27] = T0;
    $[28] = t3;
    $[29] = t4;
    $[30] = t5;
    $[31] = t6;
    $[32] = t7;
    $[33] = t8;
  } else {
    t8 = $[33];
  }
  return t8;
}
function _temp(line) {
  return stringWidth(line);
}
export {
  PreviewBox
};
