import { getPlatform } from "../utils/platform.js";
const NON_REBINDABLE = [
  {
    key: "ctrl+c",
    reason: "Cannot be rebound - used for interrupt/exit (hardcoded)",
    severity: "error"
  },
  {
    key: "ctrl+d",
    reason: "Cannot be rebound - used for exit (hardcoded)",
    severity: "error"
  },
  {
    key: "ctrl+m",
    reason: "Cannot be rebound - identical to Enter in terminals (both send CR)",
    severity: "error"
  }
];
const TERMINAL_RESERVED = [
  {
    key: "ctrl+z",
    reason: "Unix process suspend (SIGTSTP)",
    severity: "warning"
  },
  {
    key: "ctrl+\\",
    reason: "Terminal quit signal (SIGQUIT)",
    severity: "error"
  }
];
const MACOS_RESERVED = [
  { key: "cmd+c", reason: "macOS system copy", severity: "error" },
  { key: "cmd+v", reason: "macOS system paste", severity: "error" },
  { key: "cmd+x", reason: "macOS system cut", severity: "error" },
  { key: "cmd+q", reason: "macOS quit application", severity: "error" },
  { key: "cmd+w", reason: "macOS close window/tab", severity: "error" },
  { key: "cmd+tab", reason: "macOS app switcher", severity: "error" },
  { key: "cmd+space", reason: "macOS Spotlight", severity: "error" }
];
function getReservedShortcuts() {
  const platform = getPlatform();
  const reserved = [...NON_REBINDABLE, ...TERMINAL_RESERVED];
  if (platform === "macos") {
    reserved.push(...MACOS_RESERVED);
  }
  return reserved;
}
function normalizeKeyForComparison(key) {
  return key.trim().split(/\s+/).map(normalizeStep).join(" ");
}
function normalizeStep(step) {
  const parts = step.split("+");
  const modifiers = [];
  let mainKey = "";
  for (const part of parts) {
    const lower = part.trim().toLowerCase();
    if ([
      "ctrl",
      "control",
      "alt",
      "opt",
      "option",
      "meta",
      "cmd",
      "command",
      "shift"
    ].includes(lower)) {
      if (lower === "control") modifiers.push("ctrl");
      else if (lower === "option" || lower === "opt") modifiers.push("alt");
      else if (lower === "command" || lower === "cmd") modifiers.push("cmd");
      else modifiers.push(lower);
    } else {
      mainKey = lower;
    }
  }
  modifiers.sort();
  return [...modifiers, mainKey].join("+");
}
export {
  MACOS_RESERVED,
  NON_REBINDABLE,
  TERMINAL_RESERVED,
  getReservedShortcuts,
  normalizeKeyForComparison
};
