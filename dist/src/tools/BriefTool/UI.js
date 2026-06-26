import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import figures from "figures";
import { Markdown } from "../../components/Markdown.js";
import { BLACK_CIRCLE } from "../../constants/figures.js";
import { Box, Text } from "../../ink.js";
import { getDisplayPath } from "../../utils/file.js";
import { formatFileSize } from "../../utils/format.js";
import { formatBriefTimestamp } from "../../utils/formatBriefTimestamp.js";
function renderToolUseMessage() {
  return "";
}
function renderToolResultMessage(output, _progressMessages, options) {
  const hasAttachments = (output.attachments?.length ?? 0) > 0;
  if (!output.message && !hasAttachments) {
    return null;
  }
  if (options?.isTranscriptMode) {
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "row", marginTop: 1, children: [
      /* @__PURE__ */ jsx(Box, { minWidth: 2, children: /* @__PURE__ */ jsx(Text, { color: "text", children: BLACK_CIRCLE }) }),
      /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        output.message ? /* @__PURE__ */ jsx(Markdown, { children: output.message }) : null,
        /* @__PURE__ */ jsx(AttachmentList, { attachments: output.attachments })
      ] })
    ] });
  }
  if (options?.isBriefOnly) {
    const ts = output.sentAt ? formatBriefTimestamp(output.sentAt) : "";
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, paddingLeft: 2, children: [
      /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
        /* @__PURE__ */ jsx(Text, { color: "briefLabelClaude", children: "Claude" }),
        ts ? /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          " ",
          ts
        ] }) : null
      ] }),
      /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        output.message ? /* @__PURE__ */ jsx(Markdown, { children: output.message }) : null,
        /* @__PURE__ */ jsx(AttachmentList, { attachments: output.attachments })
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "row", marginTop: 1, children: [
    /* @__PURE__ */ jsx(Box, { minWidth: 2 }),
    /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      output.message ? /* @__PURE__ */ jsx(Markdown, { children: output.message }) : null,
      /* @__PURE__ */ jsx(AttachmentList, { attachments: output.attachments })
    ] })
  ] });
}
function AttachmentList(t0) {
  const $ = _c(4);
  const {
    attachments
  } = t0;
  if (!attachments || attachments.length === 0) {
    return null;
  }
  let t1;
  if ($[0] !== attachments) {
    t1 = attachments.map(_temp);
    $[0] = attachments;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== t1) {
    t2 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginTop: 1, children: t1 });
    $[2] = t1;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  return t2;
}
function _temp(att) {
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
    /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      figures.pointerSmall,
      " ",
      att.isImage ? "[image]" : "[file]",
      " "
    ] }),
    /* @__PURE__ */ jsx(Text, { children: getDisplayPath(att.path) }),
    /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      " (",
      formatFileSize(att.size),
      ")"
    ] })
  ] }, att.path);
}
export {
  AttachmentList,
  renderToolResultMessage,
  renderToolUseMessage
};
