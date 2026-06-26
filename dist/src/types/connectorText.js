function isConnectorTextBlock(block) {
  return typeof block === "object" && block !== null && "type" in block && block.type === "connector_text";
}
export {
  isConnectorTextBlock
};
