import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { marked } from "marked";
import { Suspense, use, useRef } from "react";
import { useSettings } from "../hooks/useSettings.js";
import { Ansi, Box, useTheme } from "../ink.js";
import { getCliHighlightPromise } from "../utils/cliHighlight.js";
import { hashContent } from "../utils/hash.js";
import { configureMarked, formatToken } from "../utils/markdown.js";
import { stripPromptXMLTags } from "../utils/messages.js";
import { MarkdownTable } from "./MarkdownTable.js";
const TOKEN_CACHE_MAX = 500;
const tokenCache = /* @__PURE__ */ new Map();
const MD_SYNTAX_RE = /[#*`|[>\-_~]|\n\n|^\d+\. |\n\d+\. /;
function hasMarkdownSyntax(s) {
  return MD_SYNTAX_RE.test(s.length > 500 ? s.slice(0, 500) : s);
}
function cachedLexer(content) {
  if (!hasMarkdownSyntax(content)) {
    return [{
      type: "paragraph",
      raw: content,
      text: content,
      tokens: [{
        type: "text",
        raw: content,
        text: content
      }]
    }];
  }
  const key = hashContent(content);
  const hit = tokenCache.get(key);
  if (hit) {
    tokenCache.delete(key);
    tokenCache.set(key, hit);
    return hit;
  }
  const tokens = marked.lexer(content);
  if (tokenCache.size >= TOKEN_CACHE_MAX) {
    const first = tokenCache.keys().next().value;
    if (first !== void 0) tokenCache.delete(first);
  }
  tokenCache.set(key, tokens);
  return tokens;
}
function Markdown(props) {
  const $ = _c(4);
  const settings = useSettings();
  if (settings.syntaxHighlightingDisabled) {
    let t02;
    if ($[0] !== props) {
      t02 = /* @__PURE__ */ jsx(MarkdownBody, { ...props, highlight: null });
      $[0] = props;
      $[1] = t02;
    } else {
      t02 = $[1];
    }
    return t02;
  }
  let t0;
  if ($[2] !== props) {
    t0 = /* @__PURE__ */ jsx(Suspense, { fallback: /* @__PURE__ */ jsx(MarkdownBody, { ...props, highlight: null }), children: /* @__PURE__ */ jsx(MarkdownWithHighlight, { ...props }) });
    $[2] = props;
    $[3] = t0;
  } else {
    t0 = $[3];
  }
  return t0;
}
function MarkdownWithHighlight(props) {
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
    t1 = /* @__PURE__ */ jsx(MarkdownBody, { ...props, highlight });
    $[1] = highlight;
    $[2] = props;
    $[3] = t1;
  } else {
    t1 = $[3];
  }
  return t1;
}
function MarkdownBody(t0) {
  const $ = _c(7);
  const {
    children,
    dimColor,
    highlight
  } = t0;
  const [theme] = useTheme();
  configureMarked();
  let elements;
  if ($[0] !== children || $[1] !== dimColor || $[2] !== highlight || $[3] !== theme) {
    const tokens = cachedLexer(stripPromptXMLTags(children));
    elements = [];
    let nonTableContent = "";
    const flushNonTableContent = function flushNonTableContent2() {
      if (nonTableContent) {
        elements.push(/* @__PURE__ */ jsx(Ansi, { dimColor, children: nonTableContent.trim() }, elements.length));
        nonTableContent = "";
      }
    };
    for (const token of tokens) {
      if (token.type === "table") {
        flushNonTableContent();
        elements.push(/* @__PURE__ */ jsx(MarkdownTable, { token, highlight }, elements.length));
      } else {
        nonTableContent = nonTableContent + formatToken(token, theme, 0, null, null, highlight);
        nonTableContent;
      }
    }
    flushNonTableContent();
    $[0] = children;
    $[1] = dimColor;
    $[2] = highlight;
    $[3] = theme;
    $[4] = elements;
  } else {
    elements = $[4];
  }
  const elements_0 = elements;
  let t1;
  if ($[5] !== elements_0) {
    t1 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", gap: 1, children: elements_0 });
    $[5] = elements_0;
    $[6] = t1;
  } else {
    t1 = $[6];
  }
  return t1;
}
function StreamingMarkdown({
  children
}) {
  "use no memo";
  configureMarked();
  const stripped = stripPromptXMLTags(children);
  const stablePrefixRef = useRef("");
  if (!stripped.startsWith(stablePrefixRef.current)) {
    stablePrefixRef.current = "";
  }
  const boundary = stablePrefixRef.current.length;
  const tokens = marked.lexer(stripped.substring(boundary));
  let lastContentIdx = tokens.length - 1;
  while (lastContentIdx >= 0 && tokens[lastContentIdx].type === "space") {
    lastContentIdx--;
  }
  let advance = 0;
  for (let i = 0; i < lastContentIdx; i++) {
    advance += tokens[i].raw.length;
  }
  if (advance > 0) {
    stablePrefixRef.current = stripped.substring(0, boundary + advance);
  }
  const stablePrefix = stablePrefixRef.current;
  const unstableSuffix = stripped.substring(stablePrefix.length);
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
    stablePrefix && /* @__PURE__ */ jsx(Markdown, { children: stablePrefix }),
    unstableSuffix && /* @__PURE__ */ jsx(Markdown, { children: unstableSuffix })
  ] });
}
export {
  Markdown,
  StreamingMarkdown
};
