import { getHistory } from "../../history.js";
import { logForDebugging } from "../debug.js";
let shellHistoryCache = null;
let shellHistoryCacheTimestamp = 0;
const CACHE_TTL_MS = 6e4;
async function getShellHistoryCommands() {
  const now = Date.now();
  if (shellHistoryCache && now - shellHistoryCacheTimestamp < CACHE_TTL_MS) {
    return shellHistoryCache;
  }
  const commands = [];
  const seen = /* @__PURE__ */ new Set();
  try {
    for await (const entry of getHistory()) {
      if (entry.display && entry.display.startsWith("!")) {
        const command = entry.display.slice(1).trim();
        if (command && !seen.has(command)) {
          seen.add(command);
          commands.push(command);
        }
      }
      if (commands.length >= 50) {
        break;
      }
    }
  } catch (error) {
    logForDebugging(`Failed to read shell history: ${error}`);
  }
  shellHistoryCache = commands;
  shellHistoryCacheTimestamp = now;
  return commands;
}
function clearShellHistoryCache() {
  shellHistoryCache = null;
  shellHistoryCacheTimestamp = 0;
}
function prependToShellHistoryCache(command) {
  if (!shellHistoryCache) {
    return;
  }
  const idx = shellHistoryCache.indexOf(command);
  if (idx !== -1) {
    shellHistoryCache.splice(idx, 1);
  }
  shellHistoryCache.unshift(command);
}
async function getShellHistoryCompletion(input) {
  if (!input || input.length < 2) {
    return null;
  }
  const trimmedInput = input.trim();
  if (!trimmedInput) {
    return null;
  }
  const commands = await getShellHistoryCommands();
  for (const command of commands) {
    if (command.startsWith(input) && command !== input) {
      return {
        fullCommand: command,
        suffix: command.slice(input.length)
      };
    }
  }
  return null;
}
export {
  clearShellHistoryCache,
  getShellHistoryCompletion,
  prependToShellHistoryCache
};
