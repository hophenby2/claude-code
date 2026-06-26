import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { CtrlOToExpand } from "../../components/CtrlOToExpand.js";
import { FallbackToolUseErrorMessage } from "../../components/FallbackToolUseErrorMessage.js";
import { MessageResponse } from "../../components/MessageResponse.js";
import { Box, Text } from "../../ink.js";
import { getDisplayPath } from "../../utils/file.js";
import { extractTag } from "../../utils/messages.js";
import { getSymbolAtPosition } from "./symbolContext.js";
const OPERATION_LABELS = {
  goToDefinition: {
    singular: "definition",
    plural: "definitions"
  },
  findReferences: {
    singular: "reference",
    plural: "references"
  },
  documentSymbol: {
    singular: "symbol",
    plural: "symbols"
  },
  workspaceSymbol: {
    singular: "symbol",
    plural: "symbols"
  },
  hover: {
    singular: "hover info",
    plural: "hover info",
    special: "available"
  },
  goToImplementation: {
    singular: "implementation",
    plural: "implementations"
  },
  prepareCallHierarchy: {
    singular: "call item",
    plural: "call items"
  },
  incomingCalls: {
    singular: "caller",
    plural: "callers"
  },
  outgoingCalls: {
    singular: "callee",
    plural: "callees"
  }
};
function LSPResultSummary(t0) {
  const $ = _c(24);
  const {
    operation,
    resultCount,
    fileCount,
    content,
    verbose
  } = t0;
  let t1;
  if ($[0] !== operation) {
    t1 = OPERATION_LABELS[operation] || {
      singular: "result",
      plural: "results"
    };
    $[0] = operation;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const labelConfig = t1;
  const countLabel = resultCount === 1 ? labelConfig.singular : labelConfig.plural;
  let t2;
  if ($[2] !== countLabel || $[3] !== labelConfig.special || $[4] !== operation || $[5] !== resultCount) {
    t2 = operation === "hover" && resultCount > 0 && labelConfig.special ? /* @__PURE__ */ jsxs(Text, { children: [
      "Hover info ",
      labelConfig.special
    ] }) : /* @__PURE__ */ jsxs(Text, { children: [
      "Found ",
      /* @__PURE__ */ jsxs(Text, { bold: true, children: [
        resultCount,
        " "
      ] }),
      countLabel
    ] });
    $[2] = countLabel;
    $[3] = labelConfig.special;
    $[4] = operation;
    $[5] = resultCount;
    $[6] = t2;
  } else {
    t2 = $[6];
  }
  const primaryText = t2;
  let t3;
  if ($[7] !== fileCount) {
    t3 = fileCount > 1 ? /* @__PURE__ */ jsxs(Text, { children: [
      " ",
      "across ",
      /* @__PURE__ */ jsxs(Text, { bold: true, children: [
        fileCount,
        " "
      ] }),
      "files"
    ] }) : null;
    $[7] = fileCount;
    $[8] = t3;
  } else {
    t3 = $[8];
  }
  const secondaryText = t3;
  if (verbose) {
    let t42;
    if ($[9] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t42 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: "\xA0\xA0\u23BF \xA0" });
      $[9] = t42;
    } else {
      t42 = $[9];
    }
    let t52;
    if ($[10] !== primaryText || $[11] !== secondaryText) {
      t52 = /* @__PURE__ */ jsx(Box, { flexDirection: "row", children: /* @__PURE__ */ jsxs(Text, { children: [
        t42,
        primaryText,
        secondaryText
      ] }) });
      $[10] = primaryText;
      $[11] = secondaryText;
      $[12] = t52;
    } else {
      t52 = $[12];
    }
    let t6;
    if ($[13] !== content) {
      t6 = /* @__PURE__ */ jsx(Box, { marginLeft: 5, children: /* @__PURE__ */ jsx(Text, { children: content }) });
      $[13] = content;
      $[14] = t6;
    } else {
      t6 = $[14];
    }
    let t7;
    if ($[15] !== t52 || $[16] !== t6) {
      t7 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        t52,
        t6
      ] });
      $[15] = t52;
      $[16] = t6;
      $[17] = t7;
    } else {
      t7 = $[17];
    }
    return t7;
  }
  let t4;
  if ($[18] !== resultCount) {
    t4 = resultCount > 0 && /* @__PURE__ */ jsx(CtrlOToExpand, {});
    $[18] = resultCount;
    $[19] = t4;
  } else {
    t4 = $[19];
  }
  let t5;
  if ($[20] !== primaryText || $[21] !== secondaryText || $[22] !== t4) {
    t5 = /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsxs(Text, { children: [
      primaryText,
      secondaryText,
      " ",
      t4
    ] }) });
    $[20] = primaryText;
    $[21] = secondaryText;
    $[22] = t4;
    $[23] = t5;
  } else {
    t5 = $[23];
  }
  return t5;
}
function userFacingName() {
  return "LSP";
}
function renderToolUseMessage(input, {
  verbose
}) {
  if (!input.operation) {
    return null;
  }
  const parts = [];
  if ((input.operation === "goToDefinition" || input.operation === "findReferences" || input.operation === "hover" || input.operation === "goToImplementation") && input.filePath && input.line !== void 0 && input.character !== void 0) {
    const symbol = getSymbolAtPosition(input.filePath, input.line - 1, input.character - 1);
    const displayPath = verbose ? input.filePath : getDisplayPath(input.filePath);
    if (symbol) {
      parts.push(`operation: "${input.operation}"`);
      parts.push(`symbol: "${symbol}"`);
      parts.push(`in: "${displayPath}"`);
    } else {
      parts.push(`operation: "${input.operation}"`);
      parts.push(`file: "${displayPath}"`);
      parts.push(`position: ${input.line}:${input.character}`);
    }
    return parts.join(", ");
  }
  parts.push(`operation: "${input.operation}"`);
  if (input.filePath) {
    const displayPath = verbose ? input.filePath : getDisplayPath(input.filePath);
    parts.push(`file: "${displayPath}"`);
  }
  return parts.join(", ");
}
function renderToolUseErrorMessage(result, {
  verbose
}) {
  if (!verbose && typeof result === "string" && extractTag(result, "tool_use_error")) {
    return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { color: "error", children: "LSP operation failed" }) });
  }
  return /* @__PURE__ */ jsx(FallbackToolUseErrorMessage, { result, verbose });
}
function renderToolResultMessage(output, _progressMessages, {
  verbose
}) {
  if (output.resultCount !== void 0 && output.fileCount !== void 0) {
    return /* @__PURE__ */ jsx(LSPResultSummary, { operation: output.operation, resultCount: output.resultCount, fileCount: output.fileCount, content: output.result, verbose });
  }
  return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { children: output.result }) });
}
export {
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  userFacingName
};
