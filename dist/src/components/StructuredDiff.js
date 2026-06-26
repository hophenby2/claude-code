import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { memo } from "react";
import { useSettings } from "../hooks/useSettings.js";
import { Box, NoSelect, RawAnsi, useTheme } from "../ink.js";
import { isFullscreenEnvEnabled } from "../utils/fullscreen.js";
import sliceAnsi from "../utils/sliceAnsi.js";
import { expectColorDiff } from "./StructuredDiff/colorDiff.js";
import { StructuredDiffFallback } from "./StructuredDiff/Fallback.js";
const RENDER_CACHE = /* @__PURE__ */ new WeakMap();
function computeGutterWidth(patch) {
  const maxLineNumber = Math.max(patch.oldStart + patch.oldLines - 1, patch.newStart + patch.newLines - 1, 1);
  return maxLineNumber.toString().length + 3;
}
function renderColorDiff(patch, firstLine, filePath, fileContent, theme, width, dim, splitGutter) {
  const ColorDiff = expectColorDiff();
  if (!ColorDiff) return null;
  const rawGutterWidth = splitGutter ? computeGutterWidth(patch) : 0;
  const gutterWidth = rawGutterWidth > 0 && rawGutterWidth < width ? rawGutterWidth : 0;
  const key = `${theme}|${width}|${dim ? 1 : 0}|${gutterWidth}|${firstLine ?? ""}|${filePath}`;
  let perHunk = RENDER_CACHE.get(patch);
  const hit = perHunk?.get(key);
  if (hit) return hit;
  const lines = new ColorDiff(patch, firstLine, filePath, fileContent).render(theme, width, dim);
  if (lines === null) return null;
  let gutters = null;
  let contents = null;
  if (gutterWidth > 0) {
    gutters = lines.map((l) => sliceAnsi(l, 0, gutterWidth));
    contents = lines.map((l) => sliceAnsi(l, gutterWidth));
  }
  const entry = {
    lines,
    gutterWidth,
    gutters,
    contents
  };
  if (!perHunk) {
    perHunk = /* @__PURE__ */ new Map();
    RENDER_CACHE.set(patch, perHunk);
  }
  if (perHunk.size >= 4) perHunk.clear();
  perHunk.set(key, entry);
  return entry;
}
const StructuredDiff = memo(function StructuredDiff2(t0) {
  const $ = _c(26);
  const {
    patch,
    dim,
    filePath,
    firstLine,
    fileContent,
    width,
    skipHighlighting: t1
  } = t0;
  const skipHighlighting = t1 === void 0 ? false : t1;
  const [theme] = useTheme();
  const settings = useSettings();
  const syntaxHighlightingDisabled = settings.syntaxHighlightingDisabled ?? false;
  const safeWidth = Math.max(1, Math.floor(width));
  let t2;
  if ($[0] !== dim || $[1] !== fileContent || $[2] !== filePath || $[3] !== firstLine || $[4] !== patch || $[5] !== safeWidth || $[6] !== skipHighlighting || $[7] !== syntaxHighlightingDisabled || $[8] !== theme) {
    const splitGutter = isFullscreenEnvEnabled();
    t2 = skipHighlighting || syntaxHighlightingDisabled ? null : renderColorDiff(patch, firstLine, filePath, fileContent ?? null, theme, safeWidth, dim, splitGutter);
    $[0] = dim;
    $[1] = fileContent;
    $[2] = filePath;
    $[3] = firstLine;
    $[4] = patch;
    $[5] = safeWidth;
    $[6] = skipHighlighting;
    $[7] = syntaxHighlightingDisabled;
    $[8] = theme;
    $[9] = t2;
  } else {
    t2 = $[9];
  }
  const cached = t2;
  if (!cached) {
    let t32;
    if ($[10] !== dim || $[11] !== patch || $[12] !== width) {
      t32 = /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(StructuredDiffFallback, { patch, dim, width }) });
      $[10] = dim;
      $[11] = patch;
      $[12] = width;
      $[13] = t32;
    } else {
      t32 = $[13];
    }
    return t32;
  }
  const {
    lines,
    gutterWidth,
    gutters,
    contents
  } = cached;
  if (gutterWidth > 0 && gutters && contents) {
    let t32;
    if ($[14] !== gutterWidth || $[15] !== gutters) {
      t32 = /* @__PURE__ */ jsx(NoSelect, { fromLeftEdge: true, children: /* @__PURE__ */ jsx(RawAnsi, { lines: gutters, width: gutterWidth }) });
      $[14] = gutterWidth;
      $[15] = gutters;
      $[16] = t32;
    } else {
      t32 = $[16];
    }
    const t4 = safeWidth - gutterWidth;
    let t5;
    if ($[17] !== contents || $[18] !== t4) {
      t5 = /* @__PURE__ */ jsx(RawAnsi, { lines: contents, width: t4 });
      $[17] = contents;
      $[18] = t4;
      $[19] = t5;
    } else {
      t5 = $[19];
    }
    let t6;
    if ($[20] !== t32 || $[21] !== t5) {
      t6 = /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
        t32,
        t5
      ] });
      $[20] = t32;
      $[21] = t5;
      $[22] = t6;
    } else {
      t6 = $[22];
    }
    return t6;
  }
  let t3;
  if ($[23] !== lines || $[24] !== safeWidth) {
    t3 = /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(RawAnsi, { lines, width: safeWidth }) });
    $[23] = lines;
    $[24] = safeWidth;
    $[25] = t3;
  } else {
    t3 = $[25];
  }
  return t3;
});
export {
  StructuredDiff
};
