import { jsx, jsxs } from "react/jsx-runtime";
const feature = (_name) => false;
import "figures";
import * as React from "react";
import { SentryErrorBoundary } from "../../SentryErrorBoundary.js";
import { Box, useTheme } from "../../../ink.js";
import "../../../state/AppState.js";
import { filterToolProgressMessages } from "../../../Tool.js";
import { deleteClassifierApproval, getClassifierApproval, getYoloClassifierApproval } from "../../../utils/classifierApprovals.js";
import "../../MessageResponse.js";
import { HookProgressMessage } from "../HookProgressMessage.js";
function UserToolSuccessMessage({
  message,
  lookups,
  toolUseID,
  progressMessagesForMessage,
  style,
  tool,
  tools,
  verbose,
  width,
  isTranscriptMode
}) {
  const [theme] = useTheme();
  const isBriefOnly = false ? (
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useAppState((s) => s.isBriefOnly)
  ) : false;
  const [classifierRule] = React.useState(() => getClassifierApproval(toolUseID));
  const [yoloReason] = React.useState(() => getYoloClassifierApproval(toolUseID));
  React.useEffect(() => {
    deleteClassifierApproval(toolUseID);
  }, [toolUseID]);
  if (!message.toolUseResult || !tool) {
    return null;
  }
  const parsedOutput = tool.outputSchema?.safeParse(message.toolUseResult);
  if (parsedOutput && !parsedOutput.success) {
    return null;
  }
  const toolResult = parsedOutput?.data ?? message.toolUseResult;
  const renderedMessage = tool.renderToolResultMessage?.(toolResult, filterToolProgressMessages(progressMessagesForMessage), {
    style,
    theme,
    tools,
    verbose,
    isTranscriptMode,
    isBriefOnly,
    input: lookups.toolUseByToolUseID.get(toolUseID)?.input
  }) ?? null;
  if (renderedMessage === null) {
    return null;
  }
  const rendersAsAssistantText = tool.userFacingName(void 0) === "";
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    /* @__PURE__ */ jsxs(Box, { flexDirection: "column", width: rendersAsAssistantText ? void 0 : width, children: [
      renderedMessage,
      false ? classifierRule && /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        /* @__PURE__ */ jsx(Text, { color: "success", children: figures.tick }),
        " Auto-approved \xB7 matched ",
        `"${classifierRule}"`
      ] }) }) : null,
      false ? yoloReason && /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Allowed by auto mode classifier" }) }) : null
    ] }),
    /* @__PURE__ */ jsx(SentryErrorBoundary, { children: /* @__PURE__ */ jsx(HookProgressMessage, { hookEvent: "PostToolUse", lookups, toolUseID, verbose, isTranscriptMode }) })
  ] });
}
export {
  UserToolSuccessMessage
};
