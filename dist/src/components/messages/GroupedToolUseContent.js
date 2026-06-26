import { filterToolProgressMessages, findToolByName } from "../../Tool.js";
function GroupedToolUseContent({
  message,
  tools,
  lookups,
  inProgressToolUseIDs,
  shouldAnimate
}) {
  const tool = findToolByName(tools, message.toolName);
  if (!tool?.renderGroupedToolUse) {
    return null;
  }
  const resultsByToolUseId = /* @__PURE__ */ new Map();
  for (const resultMsg of message.results) {
    for (const content of resultMsg.message.content) {
      if (content.type === "tool_result") {
        resultsByToolUseId.set(content.tool_use_id, {
          param: content,
          output: resultMsg.toolUseResult
        });
      }
    }
  }
  const toolUsesData = message.messages.map((msg) => {
    const content = msg.message.content[0];
    const result = resultsByToolUseId.get(content.id);
    return {
      param: content,
      isResolved: lookups.resolvedToolUseIDs.has(content.id),
      isError: lookups.erroredToolUseIDs.has(content.id),
      isInProgress: inProgressToolUseIDs.has(content.id),
      progressMessages: filterToolProgressMessages(lookups.progressMessagesByToolUseID.get(content.id) ?? []),
      result
    };
  });
  const anyInProgress = toolUsesData.some((d) => d.isInProgress);
  return tool.renderGroupedToolUse(toolUsesData, {
    shouldAnimate: shouldAnimate && anyInProgress,
    tools
  });
}
export {
  GroupedToolUseContent
};
