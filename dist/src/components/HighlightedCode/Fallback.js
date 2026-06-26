import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { extname } from "path";
import { Suspense, use } from "react";
import { Ansi, Text } from "../../ink.js";
import { getCliHighlightPromise } from "../../utils/cliHighlight.js";
import { logForDebugging } from "../../utils/debug.js";
import { convertLeadingTabsToSpaces } from "../../utils/file.js";
import { hashPair } from "../../utils/hash.js";
const HL_CACHE_MAX = 500;
const hlCache = /* @__PURE__ */ new Map();
function cachedHighlight(hl, code, language) {
  const key = hashPair(language, code);
  const hit = hlCache.get(key);
  if (hit !== void 0) {
    hlCache.delete(key);
    hlCache.set(key, hit);
    return hit;
  }
  const out = hl.highlight(code, {
    language
  });
  if (hlCache.size >= HL_CACHE_MAX) {
    const first = hlCache.keys().next().value;
    if (first !== void 0) hlCache.delete(first);
  }
  hlCache.set(key, out);
  return out;
}
function HighlightedCodeFallback(t0) {
  const $ = _c(20);
  const {
    code,
    filePath,
    dim: t1,
    skipColoring: t2
  } = t0;
  const dim = t1 === void 0 ? false : t1;
  const skipColoring = t2 === void 0 ? false : t2;
  let t3;
  if ($[0] !== code) {
    t3 = convertLeadingTabsToSpaces(code);
    $[0] = code;
    $[1] = t3;
  } else {
    t3 = $[1];
  }
  const codeWithSpaces = t3;
  if (skipColoring) {
    let t42;
    if ($[2] !== codeWithSpaces) {
      t42 = /* @__PURE__ */ jsx(Ansi, { children: codeWithSpaces });
      $[2] = codeWithSpaces;
      $[3] = t42;
    } else {
      t42 = $[3];
    }
    let t52;
    if ($[4] !== dim || $[5] !== t42) {
      t52 = /* @__PURE__ */ jsx(Text, { dimColor: dim, children: t42 });
      $[4] = dim;
      $[5] = t42;
      $[6] = t52;
    } else {
      t52 = $[6];
    }
    return t52;
  }
  let t4;
  if ($[7] !== filePath) {
    t4 = extname(filePath).slice(1);
    $[7] = filePath;
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  const language = t4;
  let t5;
  if ($[9] !== codeWithSpaces) {
    t5 = /* @__PURE__ */ jsx(Ansi, { children: codeWithSpaces });
    $[9] = codeWithSpaces;
    $[10] = t5;
  } else {
    t5 = $[10];
  }
  let t6;
  if ($[11] !== codeWithSpaces || $[12] !== language) {
    t6 = /* @__PURE__ */ jsx(Highlighted, { codeWithSpaces, language });
    $[11] = codeWithSpaces;
    $[12] = language;
    $[13] = t6;
  } else {
    t6 = $[13];
  }
  let t7;
  if ($[14] !== t5 || $[15] !== t6) {
    t7 = /* @__PURE__ */ jsx(Suspense, { fallback: t5, children: t6 });
    $[14] = t5;
    $[15] = t6;
    $[16] = t7;
  } else {
    t7 = $[16];
  }
  let t8;
  if ($[17] !== dim || $[18] !== t7) {
    t8 = /* @__PURE__ */ jsx(Text, { dimColor: dim, children: t7 });
    $[17] = dim;
    $[18] = t7;
    $[19] = t8;
  } else {
    t8 = $[19];
  }
  return t8;
}
function Highlighted(t0) {
  const $ = _c(10);
  const {
    codeWithSpaces,
    language
  } = t0;
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = getCliHighlightPromise();
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const hl = use(t1);
  let t2;
  if ($[1] !== codeWithSpaces || $[2] !== hl || $[3] !== language) {
    bb0: {
      if (!hl) {
        t2 = codeWithSpaces;
        break bb0;
      }
      let highlightLang = "markdown";
      if (language) {
        if (hl.supportsLanguage(language)) {
          highlightLang = language;
        } else {
          logForDebugging(`Language not supported while highlighting code, falling back to markdown: ${language}`);
        }
      }
      ;
      try {
        t2 = cachedHighlight(hl, codeWithSpaces, highlightLang);
      } catch (t32) {
        const e = t32;
        if (e instanceof Error && e.message.includes("Unknown language")) {
          logForDebugging(`Language not supported while highlighting code, falling back to markdown: ${e}`);
          let t4;
          if ($[5] !== codeWithSpaces || $[6] !== hl) {
            t4 = cachedHighlight(hl, codeWithSpaces, "markdown");
            $[5] = codeWithSpaces;
            $[6] = hl;
            $[7] = t4;
          } else {
            t4 = $[7];
          }
          t2 = t4;
          break bb0;
        }
        t2 = codeWithSpaces;
      }
    }
    $[1] = codeWithSpaces;
    $[2] = hl;
    $[3] = language;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  const out = t2;
  let t3;
  if ($[8] !== out) {
    t3 = /* @__PURE__ */ jsx(Ansi, { children: out });
    $[8] = out;
    $[9] = t3;
  } else {
    t3 = $[9];
  }
  return t3;
}
export {
  HighlightedCodeFallback
};
