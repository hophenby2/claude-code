const feature = (_name) => false;
import "../../bootstrap/state.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../../services/analytics/growthbook.js";
import "../AgentTool/constants.js";
const BRIEF_TOOL_NAME = false ? null.BRIEF_TOOL_NAME : null;
const SEND_USER_FILE_TOOL_NAME = false ? null.SEND_USER_FILE_TOOL_NAME : null;
import { TOOL_SEARCH_TOOL_NAME } from "./constants.js";
import { TOOL_SEARCH_TOOL_NAME as TOOL_SEARCH_TOOL_NAME2 } from "./constants.js";
const PROMPT_HEAD = `Fetches full schema definitions for deferred tools so they can be called.

`;
function getToolLocationHint() {
  const deltaEnabled = process.env.USER_TYPE === "ant" || getFeatureValue_CACHED_MAY_BE_STALE("tengu_glacier_2xr", false);
  return deltaEnabled ? "Deferred tools appear by name in <system-reminder> messages." : "Deferred tools appear by name in <available-deferred-tools> messages.";
}
const PROMPT_TAIL = ` Until fetched, only the name is known \u2014 there is no parameter schema, so the tool cannot be invoked. This tool takes a query, matches it against the deferred tool list, and returns the matched tools' complete JSONSchema definitions inside a <functions> block. Once a tool's schema appears in that result, it is callable exactly like any tool defined at the top of the prompt.

Result format: each matched tool appears as one <function>{"description": "...", "name": "...", "parameters": {...}}</function> line inside the <functions> block \u2014 the same encoding as the tool list at the top of this prompt.

Query forms:
- "select:Read,Edit,Grep" \u2014 fetch these exact tools by name
- "notebook jupyter" \u2014 keyword search, up to max_results best matches
- "+slack send" \u2014 require "slack" in the name, rank by remaining terms`;
function isDeferredTool(tool) {
  if (tool.alwaysLoad === true) return false;
  if (tool.isMcp === true) return true;
  if (tool.name === TOOL_SEARCH_TOOL_NAME2) return false;
  if (false) {
    const m = null;
    if (m.isForkSubagentEnabled()) return false;
  }
  if (false) {
    return false;
  }
  if (false) {
    return false;
  }
  return tool.shouldDefer === true;
}
function formatDeferredToolLine(tool) {
  return tool.name;
}
function getPrompt() {
  return PROMPT_HEAD + getToolLocationHint() + PROMPT_TAIL;
}
export {
  TOOL_SEARCH_TOOL_NAME,
  formatDeferredToolLine,
  getPrompt,
  isDeferredTool
};
