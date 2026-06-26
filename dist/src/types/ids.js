function asSessionId(id) {
  return id;
}
function asAgentId(id) {
  return id;
}
const AGENT_ID_PATTERN = /^a(?:.+-)?[0-9a-f]{16}$/;
function toAgentId(s) {
  return AGENT_ID_PATTERN.test(s) ? s : null;
}
export {
  asAgentId,
  asSessionId,
  toAgentId
};
