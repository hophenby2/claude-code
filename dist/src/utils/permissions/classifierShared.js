function extractToolUseBlock(content, toolName) {
  const block = content.find((b) => b.type === "tool_use" && b.name === toolName);
  if (!block || block.type !== "tool_use") {
    return null;
  }
  return block;
}
function parseClassifierResponse(toolUseBlock, schema) {
  const parseResult = schema.safeParse(toolUseBlock.input);
  if (!parseResult.success) {
    return null;
  }
  return parseResult.data;
}
export {
  extractToolUseBlock,
  parseClassifierResponse
};
