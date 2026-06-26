import { plural } from "../utils/stringUtils.js";
import { chordToString, parseChord, parseKeystroke } from "./parser.js";
import {
  getReservedShortcuts,
  normalizeKeyForComparison
} from "./reservedShortcuts.js";
function isKeybindingBlock(obj) {
  if (typeof obj !== "object" || obj === null) return false;
  const b = obj;
  return typeof b.context === "string" && typeof b.bindings === "object" && b.bindings !== null;
}
function isKeybindingBlockArray(arr) {
  return Array.isArray(arr) && arr.every(isKeybindingBlock);
}
const VALID_CONTEXTS = [
  "Global",
  "Chat",
  "Autocomplete",
  "Confirmation",
  "Help",
  "Transcript",
  "HistorySearch",
  "Task",
  "ThemePicker",
  "Settings",
  "Tabs",
  "Attachments",
  "Footer",
  "MessageSelector",
  "DiffDialog",
  "ModelPicker",
  "Select",
  "Plugin"
];
function isValidContext(value) {
  return VALID_CONTEXTS.includes(value);
}
function validateKeystroke(keystroke) {
  const parts = keystroke.toLowerCase().split("+");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) {
      return {
        type: "parse_error",
        severity: "error",
        message: `Empty key part in "${keystroke}"`,
        key: keystroke,
        suggestion: 'Remove extra "+" characters'
      };
    }
  }
  const parsed = parseKeystroke(keystroke);
  if (!parsed.key && !parsed.ctrl && !parsed.alt && !parsed.shift && !parsed.meta) {
    return {
      type: "parse_error",
      severity: "error",
      message: `Could not parse keystroke "${keystroke}"`,
      key: keystroke
    };
  }
  return null;
}
function validateBlock(block, blockIndex) {
  const warnings = [];
  if (typeof block !== "object" || block === null) {
    warnings.push({
      type: "parse_error",
      severity: "error",
      message: `Keybinding block ${blockIndex + 1} is not an object`
    });
    return warnings;
  }
  const b = block;
  const rawContext = b.context;
  let contextName;
  if (typeof rawContext !== "string") {
    warnings.push({
      type: "parse_error",
      severity: "error",
      message: `Keybinding block ${blockIndex + 1} missing "context" field`
    });
  } else if (!isValidContext(rawContext)) {
    warnings.push({
      type: "invalid_context",
      severity: "error",
      message: `Unknown context "${rawContext}"`,
      context: rawContext,
      suggestion: `Valid contexts: ${VALID_CONTEXTS.join(", ")}`
    });
  } else {
    contextName = rawContext;
  }
  if (typeof b.bindings !== "object" || b.bindings === null) {
    warnings.push({
      type: "parse_error",
      severity: "error",
      message: `Keybinding block ${blockIndex + 1} missing "bindings" field`
    });
    return warnings;
  }
  const bindings = b.bindings;
  for (const [key, action] of Object.entries(bindings)) {
    const keyError = validateKeystroke(key);
    if (keyError) {
      keyError.context = contextName;
      warnings.push(keyError);
    }
    if (action !== null && typeof action !== "string") {
      warnings.push({
        type: "invalid_action",
        severity: "error",
        message: `Invalid action for "${key}": must be a string or null`,
        key,
        context: contextName
      });
    } else if (typeof action === "string" && action.startsWith("command:")) {
      if (!/^command:[a-zA-Z0-9:\-_]+$/.test(action)) {
        warnings.push({
          type: "invalid_action",
          severity: "warning",
          message: `Invalid command binding "${action}" for "${key}": command name may only contain alphanumeric characters, colons, hyphens, and underscores`,
          key,
          context: contextName,
          action
        });
      }
      if (contextName && contextName !== "Chat") {
        warnings.push({
          type: "invalid_action",
          severity: "warning",
          message: `Command binding "${action}" must be in "Chat" context, not "${contextName}"`,
          key,
          context: contextName,
          action,
          suggestion: 'Move this binding to a block with "context": "Chat"'
        });
      }
    } else if (action === "voice:pushToTalk") {
      const ks = parseChord(key)[0];
      if (ks && !ks.ctrl && !ks.alt && !ks.shift && !ks.meta && !ks.super && /^[a-z]$/.test(ks.key)) {
        warnings.push({
          type: "invalid_action",
          severity: "warning",
          message: `Binding "${key}" to voice:pushToTalk prints into the input during warmup; use space or a modifier combo like meta+k`,
          key,
          context: contextName,
          action
        });
      }
    }
  }
  return warnings;
}
function checkDuplicateKeysInJson(jsonString) {
  const warnings = [];
  const bindingsBlockPattern = /"bindings"\s*:\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  let blockMatch;
  while ((blockMatch = bindingsBlockPattern.exec(jsonString)) !== null) {
    const blockContent = blockMatch[1];
    if (!blockContent) continue;
    const textBeforeBlock = jsonString.slice(0, blockMatch.index);
    const contextMatch = textBeforeBlock.match(
      /"context"\s*:\s*"([^"]+)"[^{]*$/
    );
    const context = contextMatch?.[1] ?? "unknown";
    const keyPattern = /"([^"]+)"\s*:/g;
    const keysByName = /* @__PURE__ */ new Map();
    let keyMatch;
    while ((keyMatch = keyPattern.exec(blockContent)) !== null) {
      const key = keyMatch[1];
      if (!key) continue;
      const count = (keysByName.get(key) ?? 0) + 1;
      keysByName.set(key, count);
      if (count === 2) {
        warnings.push({
          type: "duplicate",
          severity: "warning",
          message: `Duplicate key "${key}" in ${context} bindings`,
          key,
          context,
          suggestion: `This key appears multiple times in the same context. JSON uses the last value, earlier values are ignored.`
        });
      }
    }
  }
  return warnings;
}
function validateUserConfig(userBlocks) {
  const warnings = [];
  if (!Array.isArray(userBlocks)) {
    warnings.push({
      type: "parse_error",
      severity: "error",
      message: "keybindings.json must contain an array",
      suggestion: "Wrap your bindings in [ ]"
    });
    return warnings;
  }
  for (let i = 0; i < userBlocks.length; i++) {
    warnings.push(...validateBlock(userBlocks[i], i));
  }
  return warnings;
}
function checkDuplicates(blocks) {
  const warnings = [];
  const seenByContext = /* @__PURE__ */ new Map();
  for (const block of blocks) {
    const contextMap = seenByContext.get(block.context) ?? /* @__PURE__ */ new Map();
    seenByContext.set(block.context, contextMap);
    for (const [key, action] of Object.entries(block.bindings)) {
      const normalizedKey = normalizeKeyForComparison(key);
      const existingAction = contextMap.get(normalizedKey);
      if (existingAction && existingAction !== action) {
        warnings.push({
          type: "duplicate",
          severity: "warning",
          message: `Duplicate binding "${key}" in ${block.context} context`,
          key,
          context: block.context,
          action: action ?? "null (unbind)",
          suggestion: `Previously bound to "${existingAction}". Only the last binding will be used.`
        });
      }
      contextMap.set(normalizedKey, action ?? "null");
    }
  }
  return warnings;
}
function checkReservedShortcuts(bindings) {
  const warnings = [];
  const reserved = getReservedShortcuts();
  for (const binding of bindings) {
    const keyDisplay = chordToString(binding.chord);
    const normalizedKey = normalizeKeyForComparison(keyDisplay);
    for (const res of reserved) {
      if (normalizeKeyForComparison(res.key) === normalizedKey) {
        warnings.push({
          type: "reserved",
          severity: res.severity,
          message: `"${keyDisplay}" may not work: ${res.reason}`,
          key: keyDisplay,
          context: binding.context,
          action: binding.action ?? void 0
        });
      }
    }
  }
  return warnings;
}
function getUserBindingsForValidation(userBlocks) {
  const bindings = [];
  for (const block of userBlocks) {
    for (const [key, action] of Object.entries(block.bindings)) {
      const chord = key.split(" ").map((k) => parseKeystroke(k));
      bindings.push({
        chord,
        action,
        context: block.context
      });
    }
  }
  return bindings;
}
function validateBindings(userBlocks, _parsedBindings) {
  const warnings = [];
  warnings.push(...validateUserConfig(userBlocks));
  if (isKeybindingBlockArray(userBlocks)) {
    warnings.push(...checkDuplicates(userBlocks));
    const userBindings = getUserBindingsForValidation(userBlocks);
    warnings.push(...checkReservedShortcuts(userBindings));
  }
  const seen = /* @__PURE__ */ new Set();
  return warnings.filter((w) => {
    const key = `${w.type}:${w.key}:${w.context}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function formatWarning(warning) {
  const icon = warning.severity === "error" ? "\u2717" : "\u26A0";
  let msg = `${icon} Keybinding ${warning.severity}: ${warning.message}`;
  if (warning.suggestion) {
    msg += `
  ${warning.suggestion}`;
  }
  return msg;
}
function formatWarnings(warnings) {
  if (warnings.length === 0) return "";
  const errors = warnings.filter((w) => w.severity === "error");
  const warns = warnings.filter((w) => w.severity === "warning");
  const lines = [];
  if (errors.length > 0) {
    lines.push(
      `Found ${errors.length} keybinding ${plural(errors.length, "error")}:`
    );
    for (const e of errors) {
      lines.push(formatWarning(e));
    }
  }
  if (warns.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(
      `Found ${warns.length} keybinding ${plural(warns.length, "warning")}:`
    );
    for (const w of warns) {
      lines.push(formatWarning(w));
    }
  }
  return lines.join("\n");
}
export {
  checkDuplicateKeysInJson,
  checkDuplicates,
  checkReservedShortcuts,
  formatWarning,
  formatWarnings,
  validateBindings,
  validateUserConfig
};
