import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import React from "react";
import Link from "./components/Link.js";
import Text from "./components/Text.js";
import { Parser } from "./termio.js";
const Ansi = React.memo(function Ansi2(t0) {
  const $ = _c(12);
  const {
    children,
    dimColor
  } = t0;
  if (typeof children !== "string") {
    let t12;
    if ($[0] !== children || $[1] !== dimColor) {
      t12 = dimColor ? /* @__PURE__ */ jsx(Text, { dim: true, children: String(children) }) : /* @__PURE__ */ jsx(Text, { children: String(children) });
      $[0] = children;
      $[1] = dimColor;
      $[2] = t12;
    } else {
      t12 = $[2];
    }
    return t12;
  }
  if (children === "") {
    return null;
  }
  let t1;
  let t2;
  if ($[3] !== children || $[4] !== dimColor) {
    t2 = /* @__PURE__ */ Symbol.for("react.early_return_sentinel");
    bb0: {
      const spans = parseToSpans(children);
      if (spans.length === 0) {
        t2 = null;
        break bb0;
      }
      if (spans.length === 1 && !hasAnyProps(spans[0].props)) {
        t2 = dimColor ? /* @__PURE__ */ jsx(Text, { dim: true, children: spans[0].text }) : /* @__PURE__ */ jsx(Text, { children: spans[0].text });
        break bb0;
      }
      let t32;
      if ($[7] !== dimColor) {
        t32 = (span, i) => {
          const hyperlink = span.props.hyperlink;
          if (dimColor) {
            span.props.dim = true;
          }
          const hasTextProps = hasAnyTextProps(span.props);
          if (hyperlink) {
            return hasTextProps ? /* @__PURE__ */ jsx(Link, { url: hyperlink, children: /* @__PURE__ */ jsx(StyledText, { color: span.props.color, backgroundColor: span.props.backgroundColor, dim: span.props.dim, bold: span.props.bold, italic: span.props.italic, underline: span.props.underline, strikethrough: span.props.strikethrough, inverse: span.props.inverse, children: span.text }) }, i) : /* @__PURE__ */ jsx(Link, { url: hyperlink, children: span.text }, i);
          }
          return hasTextProps ? /* @__PURE__ */ jsx(StyledText, { color: span.props.color, backgroundColor: span.props.backgroundColor, dim: span.props.dim, bold: span.props.bold, italic: span.props.italic, underline: span.props.underline, strikethrough: span.props.strikethrough, inverse: span.props.inverse, children: span.text }, i) : span.text;
        };
        $[7] = dimColor;
        $[8] = t32;
      } else {
        t32 = $[8];
      }
      t1 = spans.map(t32);
    }
    $[3] = children;
    $[4] = dimColor;
    $[5] = t1;
    $[6] = t2;
  } else {
    t1 = $[5];
    t2 = $[6];
  }
  if (t2 !== /* @__PURE__ */ Symbol.for("react.early_return_sentinel")) {
    return t2;
  }
  const content = t1;
  let t3;
  if ($[9] !== content || $[10] !== dimColor) {
    t3 = dimColor ? /* @__PURE__ */ jsx(Text, { dim: true, children: content }) : /* @__PURE__ */ jsx(Text, { children: content });
    $[9] = content;
    $[10] = dimColor;
    $[11] = t3;
  } else {
    t3 = $[11];
  }
  return t3;
});
function parseToSpans(input) {
  const parser = new Parser();
  const actions = parser.feed(input);
  const spans = [];
  let currentHyperlink;
  for (const action of actions) {
    if (action.type === "link") {
      if (action.action.type === "start") {
        currentHyperlink = action.action.url;
      } else {
        currentHyperlink = void 0;
      }
      continue;
    }
    if (action.type === "text") {
      const text = action.graphemes.map((g) => g.value).join("");
      if (!text) continue;
      const props = textStyleToSpanProps(action.style);
      if (currentHyperlink) {
        props.hyperlink = currentHyperlink;
      }
      const lastSpan = spans[spans.length - 1];
      if (lastSpan && propsEqual(lastSpan.props, props)) {
        lastSpan.text += text;
      } else {
        spans.push({
          text,
          props
        });
      }
    }
  }
  return spans;
}
function textStyleToSpanProps(style) {
  const props = {};
  if (style.bold) props.bold = true;
  if (style.dim) props.dim = true;
  if (style.italic) props.italic = true;
  if (style.underline !== "none") props.underline = true;
  if (style.strikethrough) props.strikethrough = true;
  if (style.inverse) props.inverse = true;
  const fgColor = colorToString(style.fg);
  if (fgColor) props.color = fgColor;
  const bgColor = colorToString(style.bg);
  if (bgColor) props.backgroundColor = bgColor;
  return props;
}
const NAMED_COLOR_MAP = {
  black: "ansi:black",
  red: "ansi:red",
  green: "ansi:green",
  yellow: "ansi:yellow",
  blue: "ansi:blue",
  magenta: "ansi:magenta",
  cyan: "ansi:cyan",
  white: "ansi:white",
  brightBlack: "ansi:blackBright",
  brightRed: "ansi:redBright",
  brightGreen: "ansi:greenBright",
  brightYellow: "ansi:yellowBright",
  brightBlue: "ansi:blueBright",
  brightMagenta: "ansi:magentaBright",
  brightCyan: "ansi:cyanBright",
  brightWhite: "ansi:whiteBright"
};
function colorToString(color) {
  switch (color.type) {
    case "named":
      return NAMED_COLOR_MAP[color.name];
    case "indexed":
      return `ansi256(${color.index})`;
    case "rgb":
      return `rgb(${color.r},${color.g},${color.b})`;
    case "default":
      return void 0;
  }
}
function propsEqual(a, b) {
  return a.color === b.color && a.backgroundColor === b.backgroundColor && a.bold === b.bold && a.dim === b.dim && a.italic === b.italic && a.underline === b.underline && a.strikethrough === b.strikethrough && a.inverse === b.inverse && a.hyperlink === b.hyperlink;
}
function hasAnyProps(props) {
  return props.color !== void 0 || props.backgroundColor !== void 0 || props.dim === true || props.bold === true || props.italic === true || props.underline === true || props.strikethrough === true || props.inverse === true || props.hyperlink !== void 0;
}
function hasAnyTextProps(props) {
  return props.color !== void 0 || props.backgroundColor !== void 0 || props.dim === true || props.bold === true || props.italic === true || props.underline === true || props.strikethrough === true || props.inverse === true;
}
function StyledText(t0) {
  const $ = _c(14);
  let bold;
  let children;
  let dim;
  let rest;
  if ($[0] !== t0) {
    ({
      bold,
      dim,
      children,
      ...rest
    } = t0);
    $[0] = t0;
    $[1] = bold;
    $[2] = children;
    $[3] = dim;
    $[4] = rest;
  } else {
    bold = $[1];
    children = $[2];
    dim = $[3];
    rest = $[4];
  }
  if (dim) {
    let t12;
    if ($[5] !== children || $[6] !== rest) {
      t12 = /* @__PURE__ */ jsx(Text, { ...rest, dim: true, children });
      $[5] = children;
      $[6] = rest;
      $[7] = t12;
    } else {
      t12 = $[7];
    }
    return t12;
  }
  if (bold) {
    let t12;
    if ($[8] !== children || $[9] !== rest) {
      t12 = /* @__PURE__ */ jsx(Text, { ...rest, bold: true, children });
      $[8] = children;
      $[9] = rest;
      $[10] = t12;
    } else {
      t12 = $[10];
    }
    return t12;
  }
  let t1;
  if ($[11] !== children || $[12] !== rest) {
    t1 = /* @__PURE__ */ jsx(Text, { ...rest, children });
    $[11] = children;
    $[12] = rest;
    $[13] = t1;
  } else {
    t1 = $[13];
  }
  return t1;
}
export {
  Ansi
};
