import { jsonParse } from "../../utils/slowOperations.js";
function renderToolUseMessage(_input) {
  return "cleanup team: current";
}
function renderToolResultMessage(content, _progressMessages, {
  verbose: _verbose
}) {
  const result = typeof content === "string" ? jsonParse(content) : content;
  if ("success" in result && "team_name" in result && "message" in result) {
    return null;
  }
  return null;
}
export {
  renderToolResultMessage,
  renderToolUseMessage
};
