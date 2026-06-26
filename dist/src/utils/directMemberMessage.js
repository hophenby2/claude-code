function parseDirectMemberMessage(input) {
  const match = input.match(/^@([\w-]+)\s+(.+)$/s);
  if (!match) return null;
  const [, recipientName, message] = match;
  if (!recipientName || !message) return null;
  const trimmedMessage = message.trim();
  if (!trimmedMessage) return null;
  return { recipientName, message: trimmedMessage };
}
async function sendDirectMemberMessage(recipientName, message, teamContext, writeToMailbox) {
  if (!teamContext || !writeToMailbox) {
    return { success: false, error: "no_team_context" };
  }
  const member = Object.values(teamContext.teammates ?? {}).find(
    (t) => t.name === recipientName
  );
  if (!member) {
    return { success: false, error: "unknown_recipient", recipientName };
  }
  await writeToMailbox(
    recipientName,
    {
      from: "user",
      text: message,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    },
    teamContext.teamName
  );
  return { success: true, recipientName };
}
export {
  parseDirectMemberMessage,
  sendDirectMemberMessage
};
