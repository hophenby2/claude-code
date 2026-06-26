function tagMessagesWithToolUseID(messages, toolUseID) {
  if (!toolUseID) {
    return messages;
  }
  return messages.map((m) => {
    if (m.type === "user") {
      return { ...m, sourceToolUseID: toolUseID };
    }
    return m;
  });
}
function getToolUseIDFromParentMessage(parentMessage, toolName) {
  const toolUseBlock = parentMessage.message.content.find(
    (block) => block.type === "tool_use" && block.name === toolName
  );
  return toolUseBlock && toolUseBlock.type === "tool_use" ? toolUseBlock.id : void 0;
}
export {
  getToolUseIDFromParentMessage,
  tagMessagesWithToolUseID
};
