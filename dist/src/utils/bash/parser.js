const feature = (_name) => false;
import { logEvent } from "../../services/analytics/index.js";
import { logForDebugging } from "../debug.js";
import "./bashParser.js";
const MAX_COMMAND_LENGTH = 1e4;
const DECLARATION_COMMANDS = /* @__PURE__ */ new Set([
  "export",
  "declare",
  "typeset",
  "readonly",
  "local",
  "unset",
  "unsetenv"
]);
const ARGUMENT_TYPES = /* @__PURE__ */ new Set(["word", "string", "raw_string", "number"]);
const SUBSTITUTION_TYPES = /* @__PURE__ */ new Set([
  "command_substitution",
  "process_substitution"
]);
const COMMAND_TYPES = /* @__PURE__ */ new Set(["command", "declaration_command"]);
let logged = false;
function logLoadOnce(success) {
  if (logged) return;
  logged = true;
  logForDebugging(
    success ? "tree-sitter: native module loaded" : "tree-sitter: unavailable"
  );
  logEvent("tengu_tree_sitter_load", { success });
}
async function ensureInitialized() {
  if (false) {
    await ensureParserInitialized();
  }
}
async function parseCommand(command) {
  if (!command || command.length > MAX_COMMAND_LENGTH) return null;
  if (false) {
    await ensureParserInitialized();
    const mod = getParserModule();
    logLoadOnce(mod !== null);
    if (!mod) return null;
    try {
      const rootNode = mod.parse(command);
      if (!rootNode) return null;
      const commandNode = findCommandNode(rootNode, null);
      const envVars = extractEnvVars(commandNode);
      return { rootNode, envVars, commandNode, originalCommand: command };
    } catch {
      return null;
    }
  }
  return null;
}
const PARSE_ABORTED = /* @__PURE__ */ Symbol("parse-aborted");
async function parseCommandRaw(command) {
  if (!command || command.length > MAX_COMMAND_LENGTH) return null;
  if (false) {
    await ensureParserInitialized();
    const mod = getParserModule();
    logLoadOnce(mod !== null);
    if (!mod) return null;
    try {
      const result = mod.parse(command);
      if (result === null) {
        logEvent("tengu_tree_sitter_parse_abort", {
          cmdLength: command.length,
          panic: false
        });
        return PARSE_ABORTED;
      }
      return result;
    } catch {
      logEvent("tengu_tree_sitter_parse_abort", {
        cmdLength: command.length,
        panic: true
      });
      return PARSE_ABORTED;
    }
  }
  return null;
}
function findCommandNode(node, parent) {
  const { type, children } = node;
  if (COMMAND_TYPES.has(type)) return node;
  if (type === "variable_assignment" && parent) {
    return parent.children.find(
      (c) => COMMAND_TYPES.has(c.type) && c.startIndex > node.startIndex
    ) ?? null;
  }
  if (type === "pipeline") {
    for (const child of children) {
      const result = findCommandNode(child, node);
      if (result) return result;
    }
    return null;
  }
  if (type === "redirected_statement") {
    return children.find((c) => COMMAND_TYPES.has(c.type)) ?? null;
  }
  for (const child of children) {
    const result = findCommandNode(child, node);
    if (result) return result;
  }
  return null;
}
function extractEnvVars(commandNode) {
  if (!commandNode || commandNode.type !== "command") return [];
  const envVars = [];
  for (const child of commandNode.children) {
    if (child.type === "variable_assignment") {
      envVars.push(child.text);
    } else if (child.type === "command_name" || child.type === "word") {
      break;
    }
  }
  return envVars;
}
function extractCommandArguments(commandNode) {
  if (commandNode.type === "declaration_command") {
    const firstChild = commandNode.children[0];
    return firstChild && DECLARATION_COMMANDS.has(firstChild.text) ? [firstChild.text] : [];
  }
  const args = [];
  let foundCommandName = false;
  for (const child of commandNode.children) {
    if (child.type === "variable_assignment") continue;
    if (child.type === "command_name" || !foundCommandName && child.type === "word") {
      foundCommandName = true;
      args.push(child.text);
      continue;
    }
    if (ARGUMENT_TYPES.has(child.type)) {
      args.push(stripQuotes(child.text));
    } else if (SUBSTITUTION_TYPES.has(child.type)) {
      break;
    }
  }
  return args;
}
function stripQuotes(text) {
  return text.length >= 2 && (text[0] === '"' && text.at(-1) === '"' || text[0] === "'" && text.at(-1) === "'") ? text.slice(1, -1) : text;
}
export {
  PARSE_ABORTED,
  ensureInitialized,
  extractCommandArguments,
  parseCommand,
  parseCommandRaw
};
