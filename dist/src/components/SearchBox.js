import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Box, Text } from "../ink.js";
function SearchBox(t0) {
  const $ = _c(17);
  const {
    query,
    placeholder: t1,
    isFocused,
    isTerminalFocused,
    prefix: t2,
    width,
    cursorOffset,
    borderless: t3
  } = t0;
  const placeholder = t1 === void 0 ? "Search\u2026" : t1;
  const prefix = t2 === void 0 ? "\u2315" : t2;
  const borderless = t3 === void 0 ? false : t3;
  const offset = cursorOffset ?? query.length;
  const t4 = borderless ? void 0 : "round";
  const t5 = isFocused ? "suggestion" : void 0;
  const t6 = !isFocused;
  const t7 = borderless ? 0 : 1;
  const t8 = !isFocused;
  let t9;
  if ($[0] !== isFocused || $[1] !== isTerminalFocused || $[2] !== offset || $[3] !== placeholder || $[4] !== query) {
    t9 = isFocused ? /* @__PURE__ */ jsx(Fragment, { children: query ? isTerminalFocused ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Text, { children: query.slice(0, offset) }),
      /* @__PURE__ */ jsx(Text, { inverse: true, children: offset < query.length ? query[offset] : " " }),
      offset < query.length && /* @__PURE__ */ jsx(Text, { children: query.slice(offset + 1) })
    ] }) : /* @__PURE__ */ jsx(Text, { children: query }) : isTerminalFocused ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Text, { inverse: true, children: placeholder.charAt(0) }),
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: placeholder.slice(1) })
    ] }) : /* @__PURE__ */ jsx(Text, { dimColor: true, children: placeholder }) }) : query ? /* @__PURE__ */ jsx(Text, { children: query }) : /* @__PURE__ */ jsx(Text, { children: placeholder });
    $[0] = isFocused;
    $[1] = isTerminalFocused;
    $[2] = offset;
    $[3] = placeholder;
    $[4] = query;
    $[5] = t9;
  } else {
    t9 = $[5];
  }
  let t10;
  if ($[6] !== prefix || $[7] !== t8 || $[8] !== t9) {
    t10 = /* @__PURE__ */ jsxs(Text, { dimColor: t8, children: [
      prefix,
      " ",
      t9
    ] });
    $[6] = prefix;
    $[7] = t8;
    $[8] = t9;
    $[9] = t10;
  } else {
    t10 = $[9];
  }
  let t11;
  if ($[10] !== t10 || $[11] !== t4 || $[12] !== t5 || $[13] !== t6 || $[14] !== t7 || $[15] !== width) {
    t11 = /* @__PURE__ */ jsx(Box, { flexShrink: 0, borderStyle: t4, borderColor: t5, borderDimColor: t6, paddingX: t7, width, children: t10 });
    $[10] = t10;
    $[11] = t4;
    $[12] = t5;
    $[13] = t6;
    $[14] = t7;
    $[15] = width;
    $[16] = t11;
  } else {
    t11 = $[16];
  }
  return t11;
}
export {
  SearchBox
};
