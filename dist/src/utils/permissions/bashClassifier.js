const PROMPT_PREFIX = "prompt:";
function extractPromptDescription(_ruleContent) {
  return null;
}
function createPromptRuleContent(description) {
  return `${PROMPT_PREFIX} ${description.trim()}`;
}
function isClassifierPermissionsEnabled() {
  return false;
}
function getBashPromptDenyDescriptions(_context) {
  return [];
}
function getBashPromptAskDescriptions(_context) {
  return [];
}
function getBashPromptAllowDescriptions(_context) {
  return [];
}
async function classifyBashCommand(_command, _cwd, _descriptions, _behavior, _signal, _isNonInteractiveSession) {
  return {
    matches: false,
    confidence: "high",
    reason: "This feature is disabled"
  };
}
async function generateGenericDescription(_command, specificDescription, _signal) {
  return specificDescription || null;
}
export {
  PROMPT_PREFIX,
  classifyBashCommand,
  createPromptRuleContent,
  extractPromptDescription,
  generateGenericDescription,
  getBashPromptAllowDescriptions,
  getBashPromptAskDescriptions,
  getBashPromptDenyDescriptions,
  isClassifierPermissionsEnabled
};
