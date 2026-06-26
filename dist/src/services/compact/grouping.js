function groupMessagesByApiRound(messages) {
  const groups = [];
  let current = [];
  let lastAssistantId;
  for (const msg of messages) {
    if (msg.type === "assistant" && msg.message.id !== lastAssistantId && current.length > 0) {
      groups.push(current);
      current = [msg];
    } else {
      current.push(msg);
    }
    if (msg.type === "assistant") {
      lastAssistantId = msg.message.id;
    }
  }
  if (current.length > 0) {
    groups.push(current);
  }
  return groups;
}
export {
  groupMessagesByApiRound
};
