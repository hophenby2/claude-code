const feature = (_name) => false;
import { AGENT_TOOL_NAME } from "../../tools/AgentTool/constants.js";
import { TASK_OUTPUT_TOOL_NAME } from "../../tools/TaskOutputTool/constants.js";
import { TASK_STOP_TOOL_NAME } from "../../tools/TaskStopTool/prompt.js";
const BRIEF_TOOL_NAME = false ? null.BRIEF_TOOL_NAME : null;
const LEGACY_TOOL_NAME_ALIASES = {
  Task: AGENT_TOOL_NAME,
  KillShell: TASK_STOP_TOOL_NAME,
  AgentOutputTool: TASK_OUTPUT_TOOL_NAME,
  BashOutputTool: TASK_OUTPUT_TOOL_NAME,
  ...false ? { Brief: BRIEF_TOOL_NAME } : {}
};
function normalizeLegacyToolName(name) {
  return LEGACY_TOOL_NAME_ALIASES[name] ?? name;
}
function getLegacyToolNames(canonicalName) {
  const result = [];
  for (const [legacy, canonical] of Object.entries(LEGACY_TOOL_NAME_ALIASES)) {
    if (canonical === canonicalName) result.push(legacy);
  }
  return result;
}
function escapeRuleContent(content) {
  return content.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
function unescapeRuleContent(content) {
  return content.replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/\\\\/g, "\\");
}
function permissionRuleValueFromString(ruleString) {
  const openParenIndex = findFirstUnescapedChar(ruleString, "(");
  if (openParenIndex === -1) {
    return { toolName: normalizeLegacyToolName(ruleString) };
  }
  const closeParenIndex = findLastUnescapedChar(ruleString, ")");
  if (closeParenIndex === -1 || closeParenIndex <= openParenIndex) {
    return { toolName: normalizeLegacyToolName(ruleString) };
  }
  if (closeParenIndex !== ruleString.length - 1) {
    return { toolName: normalizeLegacyToolName(ruleString) };
  }
  const toolName = ruleString.substring(0, openParenIndex);
  const rawContent = ruleString.substring(openParenIndex + 1, closeParenIndex);
  if (!toolName) {
    return { toolName: normalizeLegacyToolName(ruleString) };
  }
  if (rawContent === "" || rawContent === "*") {
    return { toolName: normalizeLegacyToolName(toolName) };
  }
  const ruleContent = unescapeRuleContent(rawContent);
  return { toolName: normalizeLegacyToolName(toolName), ruleContent };
}
function permissionRuleValueToString(ruleValue) {
  if (!ruleValue.ruleContent) {
    return ruleValue.toolName;
  }
  const escapedContent = escapeRuleContent(ruleValue.ruleContent);
  return `${ruleValue.toolName}(${escapedContent})`;
}
function findFirstUnescapedChar(str, char) {
  for (let i = 0; i < str.length; i++) {
    if (str[i] === char) {
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && str[j] === "\\") {
        backslashCount++;
        j--;
      }
      if (backslashCount % 2 === 0) {
        return i;
      }
    }
  }
  return -1;
}
function findLastUnescapedChar(str, char) {
  for (let i = str.length - 1; i >= 0; i--) {
    if (str[i] === char) {
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && str[j] === "\\") {
        backslashCount++;
        j--;
      }
      if (backslashCount % 2 === 0) {
        return i;
      }
    }
  }
  return -1;
}
export {
  escapeRuleContent,
  getLegacyToolNames,
  normalizeLegacyToolName,
  permissionRuleValueFromString,
  permissionRuleValueToString,
  unescapeRuleContent
};
