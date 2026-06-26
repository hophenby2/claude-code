import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import * as React from "react";
import { useTerminalSize } from "../../hooks/useTerminalSize.js";
import { Ansi, Text } from "../../ink.js";
import { createHyperlink } from "../../utils/hyperlink.js";
import { jsonParse, jsonStringify } from "../../utils/slowOperations.js";
import { renderTruncatedContent } from "../../utils/terminal.js";
import { MessageResponse } from "../MessageResponse.js";
import { InVirtualListContext } from "../messageActions.js";
import { useExpandShellOutput } from "./ExpandShellOutputContext.js";
function tryFormatJson(line) {
  try {
    const parsed = jsonParse(line);
    const stringified = jsonStringify(parsed);
    const normalizedOriginal = line.replace(/\\\//g, "/").replace(/\s+/g, "");
    const normalizedStringified = stringified.replace(/\s+/g, "");
    if (normalizedOriginal !== normalizedStringified) {
      return line;
    }
    return jsonStringify(parsed, null, 2);
  } catch {
    return line;
  }
}
const MAX_JSON_FORMAT_LENGTH = 1e4;
function tryJsonFormatContent(content) {
  if (content.length > MAX_JSON_FORMAT_LENGTH) {
    return content;
  }
  const allLines = content.split("\n");
  return allLines.map(tryFormatJson).join("\n");
}
const URL_IN_JSON = /https?:\/\/[^\s"'<>\\]+/g;
function linkifyUrlsInText(content) {
  return content.replace(URL_IN_JSON, (url) => createHyperlink(url));
}
function OutputLine(t0) {
  const $ = _c(11);
  const {
    content,
    verbose,
    isError,
    isWarning,
    linkifyUrls
  } = t0;
  const {
    columns
  } = useTerminalSize();
  const expandShellOutput = useExpandShellOutput();
  const inVirtualList = React.useContext(InVirtualListContext);
  const shouldShowFull = verbose || expandShellOutput;
  let t1;
  if ($[0] !== columns || $[1] !== content || $[2] !== inVirtualList || $[3] !== linkifyUrls || $[4] !== shouldShowFull) {
    bb0: {
      let formatted = tryJsonFormatContent(content);
      if (linkifyUrls) {
        formatted = linkifyUrlsInText(formatted);
      }
      if (shouldShowFull) {
        t1 = stripUnderlineAnsi(formatted);
        break bb0;
      }
      t1 = stripUnderlineAnsi(renderTruncatedContent(formatted, columns, inVirtualList));
    }
    $[0] = columns;
    $[1] = content;
    $[2] = inVirtualList;
    $[3] = linkifyUrls;
    $[4] = shouldShowFull;
    $[5] = t1;
  } else {
    t1 = $[5];
  }
  const formattedContent = t1;
  const color = isError ? "error" : isWarning ? "warning" : void 0;
  let t2;
  if ($[6] !== formattedContent) {
    t2 = /* @__PURE__ */ jsx(Ansi, { children: formattedContent });
    $[6] = formattedContent;
    $[7] = t2;
  } else {
    t2 = $[7];
  }
  let t3;
  if ($[8] !== color || $[9] !== t2) {
    t3 = /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { color, children: t2 }) });
    $[8] = color;
    $[9] = t2;
    $[10] = t3;
  } else {
    t3 = $[10];
  }
  return t3;
}
function stripUnderlineAnsi(content) {
  return content.replace(
    // eslint-disable-next-line no-control-regex
    /\u001b\[([0-9]+;)*4(;[0-9]+)*m|\u001b\[4(;[0-9]+)*m|\u001b\[([0-9]+;)*4m/g,
    ""
  );
}
export {
  OutputLine,
  linkifyUrlsInText,
  stripUnderlineAnsi,
  tryFormatJson,
  tryJsonFormatContent
};
