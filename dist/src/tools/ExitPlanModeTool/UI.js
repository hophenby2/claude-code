import { jsx, jsxs } from "react/jsx-runtime";
import { Markdown } from "../../components/Markdown.js";
import { MessageResponse } from "../../components/MessageResponse.js";
import { RejectedPlanMessage } from "../../components/messages/UserToolResultMessage/RejectedPlanMessage.js";
import { BLACK_CIRCLE } from "../../constants/figures.js";
import { getModeColor } from "../../utils/permissions/PermissionMode.js";
import { Box, Text } from "../../ink.js";
import { getDisplayPath } from "../../utils/file.js";
import { getPlan } from "../../utils/plans.js";
function renderToolUseMessage() {
  return null;
}
function renderToolResultMessage(output, _progressMessagesForMessage, {
  theme: _theme
}) {
  const {
    plan,
    filePath
  } = output;
  const isEmpty = !plan || plan.trim() === "";
  const displayPath = filePath ? getDisplayPath(filePath) : "";
  const awaitingLeaderApproval = output.awaitingLeaderApproval;
  if (isEmpty) {
    return /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginTop: 1, children: /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
      /* @__PURE__ */ jsx(Text, { color: getModeColor("plan"), children: BLACK_CIRCLE }),
      /* @__PURE__ */ jsx(Text, { children: " Exited plan mode" })
    ] }) });
  }
  if (awaitingLeaderApproval) {
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
      /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
        /* @__PURE__ */ jsx(Text, { color: getModeColor("plan"), children: BLACK_CIRCLE }),
        /* @__PURE__ */ jsx(Text, { children: " Plan submitted for team lead approval" })
      ] }),
      /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        filePath && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          "Plan file: ",
          displayPath
        ] }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Waiting for team lead to review and approve..." })
      ] }) })
    ] });
  }
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
    /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
      /* @__PURE__ */ jsx(Text, { color: getModeColor("plan"), children: BLACK_CIRCLE }),
      /* @__PURE__ */ jsx(Text, { children: " User approved Claude's plan" })
    ] }),
    /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      filePath && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "Plan saved to: ",
        displayPath,
        " \xB7 /plan to edit"
      ] }),
      /* @__PURE__ */ jsx(Markdown, { children: plan })
    ] }) })
  ] });
}
function renderToolUseRejectedMessage({
  plan
}, {
  theme: _theme
}) {
  const planContent = plan ?? getPlan() ?? "No plan found";
  return /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: /* @__PURE__ */ jsx(RejectedPlanMessage, { plan: planContent }) });
}
export {
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseRejectedMessage
};
