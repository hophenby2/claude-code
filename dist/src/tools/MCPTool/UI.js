import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
const feature = (_name) => false;
import figures from "figures";
import { ProgressBar } from "../../components/design-system/ProgressBar.js";
import { MessageResponse } from "../../components/MessageResponse.js";
import { linkifyUrlsInText, OutputLine } from "../../components/shell/OutputLine.js";
import { stringWidth } from "../../ink/stringWidth.js";
import { Ansi, Box, Text } from "../../ink.js";
import { formatNumber } from "../../utils/format.js";
import { createHyperlink } from "../../utils/hyperlink.js";
import { getContentSizeEstimate } from "../../utils/mcpValidation.js";
import { jsonParse, jsonStringify } from "../../utils/slowOperations.js";
const MCP_OUTPUT_WARNING_THRESHOLD_TOKENS = 1e4;
const MAX_INPUT_VALUE_CHARS = 80;
const MAX_FLAT_JSON_KEYS = 12;
const MAX_FLAT_JSON_CHARS = 5e3;
const MAX_JSON_PARSE_CHARS = 2e5;
const UNWRAP_MIN_STRING_LEN = 200;
function renderToolUseMessage(input, {
  verbose
}) {
  if (Object.keys(input).length === 0) {
    return "";
  }
  return Object.entries(input).map(([key, value]) => {
    let rendered = jsonStringify(value);
    if (false) {
      rendered = rendered.slice(0, MAX_INPUT_VALUE_CHARS).trimEnd() + "\u2026";
    }
    return `${key}: ${rendered}`;
  }).join(", ");
}
function renderToolUseProgressMessage(progressMessagesForMessage) {
  const lastProgress = progressMessagesForMessage.at(-1);
  if (!lastProgress?.data) {
    return /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Running\u2026" }) });
  }
  const {
    progress,
    total,
    progressMessage
  } = lastProgress.data;
  if (progress === void 0) {
    return /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Running\u2026" }) });
  }
  if (total !== void 0 && total > 0) {
    const ratio = Math.min(1, Math.max(0, progress / total));
    const percentage = Math.round(ratio * 100);
    return /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      progressMessage && /* @__PURE__ */ jsx(Text, { dimColor: true, children: progressMessage }),
      /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 1, children: [
        /* @__PURE__ */ jsx(ProgressBar, { ratio, width: 20 }),
        /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          percentage,
          "%"
        ] })
      ] })
    ] }) });
  }
  return /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: progressMessage ?? `Processing\u2026 ${progress}` }) });
}
function renderToolResultMessage(output, _progressMessagesForMessage, {
  verbose,
  input
}) {
  const mcpOutput = output;
  if (!verbose) {
    const slackSend = trySlackSendCompact(mcpOutput, input);
    if (slackSend !== null) {
      return /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsxs(Text, { children: [
        "Sent a message to",
        " ",
        /* @__PURE__ */ jsx(Ansi, { children: createHyperlink(slackSend.url, slackSend.channel) })
      ] }) });
    }
  }
  const estimatedTokens = getContentSizeEstimate(mcpOutput);
  const showWarning = estimatedTokens > MCP_OUTPUT_WARNING_THRESHOLD_TOKENS;
  const warningMessage = showWarning ? `${figures.warning} Large MCP response (~${formatNumber(estimatedTokens)} tokens), this can fill up context quickly` : null;
  let contentElement;
  if (Array.isArray(mcpOutput)) {
    const contentBlocks = mcpOutput.map((item, i) => {
      if (item.type === "image") {
        return /* @__PURE__ */ jsx(Box, { justifyContent: "space-between", overflowX: "hidden", width: "100%", children: /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { children: "[Image]" }) }) }, i);
      }
      const textContent = item.type === "text" && "text" in item && item.text !== null && item.text !== void 0 ? String(item.text) : "";
      return false ? /* @__PURE__ */ jsx(MCPTextOutput, { content: textContent, verbose }, i) : /* @__PURE__ */ jsx(OutputLine, { content: textContent, verbose }, i);
    });
    contentElement = /* @__PURE__ */ jsx(Box, { flexDirection: "column", width: "100%", children: contentBlocks });
  } else if (!mcpOutput) {
    contentElement = /* @__PURE__ */ jsx(Box, { justifyContent: "space-between", overflowX: "hidden", width: "100%", children: /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "(No content)" }) }) });
  } else {
    contentElement = false ? /* @__PURE__ */ jsx(MCPTextOutput, { content: mcpOutput, verbose }) : /* @__PURE__ */ jsx(OutputLine, { content: mcpOutput, verbose });
  }
  if (warningMessage) {
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { color: "warning", children: warningMessage }) }),
      contentElement
    ] });
  }
  return contentElement;
}
function MCPTextOutput(t0) {
  const $ = _c(18);
  const {
    content,
    verbose
  } = t0;
  let t1;
  if ($[0] !== content || $[1] !== verbose) {
    t1 = /* @__PURE__ */ Symbol.for("react.early_return_sentinel");
    bb0: {
      const unwrapped = tryUnwrapTextPayload(content);
      if (unwrapped !== null) {
        const t22 = unwrapped.extras.length > 0 && /* @__PURE__ */ jsx(Text, { dimColor: true, children: unwrapped.extras.map(_temp).join(" \xB7 ") });
        let t32;
        if ($[3] !== unwrapped || $[4] !== verbose) {
          t32 = /* @__PURE__ */ jsx(OutputLine, { content: unwrapped.body, verbose, linkifyUrls: true });
          $[3] = unwrapped;
          $[4] = verbose;
          $[5] = t32;
        } else {
          t32 = $[5];
        }
        let t4;
        if ($[6] !== t22 || $[7] !== t32) {
          t4 = /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
            t22,
            t32
          ] }) });
          $[6] = t22;
          $[7] = t32;
          $[8] = t4;
        } else {
          t4 = $[8];
        }
        t1 = t4;
        break bb0;
      }
    }
    $[0] = content;
    $[1] = verbose;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  if (t1 !== /* @__PURE__ */ Symbol.for("react.early_return_sentinel")) {
    return t1;
  }
  let t2;
  if ($[9] !== content) {
    t2 = /* @__PURE__ */ Symbol.for("react.early_return_sentinel");
    bb1: {
      const flat = tryFlattenJson(content);
      if (flat !== null) {
        const maxKeyWidth = Math.max(...flat.map(_temp2));
        let t32;
        if ($[11] !== maxKeyWidth) {
          t32 = (t42, i) => {
            const [key, value] = t42;
            return /* @__PURE__ */ jsxs(Text, { children: [
              /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
                key.padEnd(maxKeyWidth),
                ": "
              ] }),
              /* @__PURE__ */ jsx(Ansi, { children: linkifyUrlsInText(value) })
            ] }, i);
          };
          $[11] = maxKeyWidth;
          $[12] = t32;
        } else {
          t32 = $[12];
        }
        const t4 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: flat.map(t32) });
        let t5;
        if ($[13] !== t4) {
          t5 = /* @__PURE__ */ jsx(MessageResponse, { children: t4 });
          $[13] = t4;
          $[14] = t5;
        } else {
          t5 = $[14];
        }
        t2 = t5;
        break bb1;
      }
    }
    $[9] = content;
    $[10] = t2;
  } else {
    t2 = $[10];
  }
  if (t2 !== /* @__PURE__ */ Symbol.for("react.early_return_sentinel")) {
    return t2;
  }
  let t3;
  if ($[15] !== content || $[16] !== verbose) {
    t3 = /* @__PURE__ */ jsx(OutputLine, { content, verbose, linkifyUrls: true });
    $[15] = content;
    $[16] = verbose;
    $[17] = t3;
  } else {
    t3 = $[17];
  }
  return t3;
}
function _temp2(t0) {
  const [k_0] = t0;
  return stringWidth(k_0);
}
function _temp(t0) {
  const [k, v] = t0;
  return `${k}: ${v}`;
}
function parseJsonEntries(content, {
  maxChars,
  maxKeys
}) {
  const trimmed = content.trim();
  if (trimmed.length === 0 || trimmed.length > maxChars || trimmed[0] !== "{") {
    return null;
  }
  let parsed;
  try {
    parsed = jsonParse(trimmed);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const entries = Object.entries(parsed);
  if (entries.length === 0 || entries.length > maxKeys) {
    return null;
  }
  return entries;
}
function tryFlattenJson(content) {
  const entries = parseJsonEntries(content, {
    maxChars: MAX_FLAT_JSON_CHARS,
    maxKeys: MAX_FLAT_JSON_KEYS
  });
  if (entries === null) return null;
  const result = [];
  for (const [key, value] of entries) {
    if (typeof value === "string") {
      result.push([key, value]);
    } else if (value === null || typeof value === "number" || typeof value === "boolean") {
      result.push([key, String(value)]);
    } else if (typeof value === "object") {
      const compact = jsonStringify(value);
      if (compact.length > 120) return null;
      result.push([key, compact]);
    } else {
      return null;
    }
  }
  return result;
}
function tryUnwrapTextPayload(content) {
  const entries = parseJsonEntries(content, {
    maxChars: MAX_JSON_PARSE_CHARS,
    maxKeys: 4
  });
  if (entries === null) return null;
  let body = null;
  const extras = [];
  for (const [key, value] of entries) {
    if (typeof value === "string") {
      const t = value.trimEnd();
      const isDominant = t.length > UNWRAP_MIN_STRING_LEN || t.includes("\n") && t.length > 50;
      if (isDominant) {
        if (body !== null) return null;
        body = t;
        continue;
      }
      if (t.length > 150) return null;
      extras.push([key, t.replace(/\s+/g, " ")]);
    } else if (value === null || typeof value === "number" || typeof value === "boolean") {
      extras.push([key, String(value)]);
    } else {
      return null;
    }
  }
  if (body === null) return null;
  return {
    body,
    extras
  };
}
const SLACK_ARCHIVES_RE = /^https:\/\/[a-z0-9-]+\.slack\.com\/archives\/([A-Z0-9]+)\/p\d+$/;
function trySlackSendCompact(output, input) {
  let text = output;
  if (Array.isArray(output)) {
    const block = output.find((b) => b.type === "text");
    text = block && "text" in block ? block.text : void 0;
  }
  if (typeof text !== "string" || !text.includes('"message_link"')) {
    return null;
  }
  const entries = parseJsonEntries(text, {
    maxChars: 2e3,
    maxKeys: 6
  });
  const url = entries?.find(([k]) => k === "message_link")?.[1];
  if (typeof url !== "string") return null;
  const m = SLACK_ARCHIVES_RE.exec(url);
  if (!m) return null;
  const inp = input;
  const raw = inp?.channel_id ?? inp?.channel ?? m[1];
  const label = typeof raw === "string" && raw ? raw : "slack";
  return {
    channel: label.startsWith("#") ? label : `#${label}`,
    url
  };
}
export {
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage,
  tryFlattenJson,
  trySlackSendCompact,
  tryUnwrapTextPayload
};
