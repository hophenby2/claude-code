import { randomBytes } from "crypto";
import { readFile, rename, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { logForDebugging } from "../debug.js";
import { getFsImplementation } from "../fsOperations.js";
import { logError } from "../log.js";
import { jsonParse, jsonStringify } from "../slowOperations.js";
import { getPluginsDirectory } from "./pluginDirectories.js";
const FLAGGED_PLUGINS_FILENAME = "flagged-plugins.json";
const SEEN_EXPIRY_MS = 48 * 60 * 60 * 1e3;
let cache = null;
function getFlaggedPluginsPath() {
  return join(getPluginsDirectory(), FLAGGED_PLUGINS_FILENAME);
}
function parsePluginsData(content) {
  const parsed = jsonParse(content);
  if (typeof parsed !== "object" || parsed === null || !("plugins" in parsed) || typeof parsed.plugins !== "object" || parsed.plugins === null) {
    return {};
  }
  const plugins = parsed.plugins;
  const result = {};
  for (const [id, entry] of Object.entries(plugins)) {
    if (entry && typeof entry === "object" && "flaggedAt" in entry && typeof entry.flaggedAt === "string") {
      const parsed2 = {
        flaggedAt: entry.flaggedAt
      };
      if ("seenAt" in entry && typeof entry.seenAt === "string") {
        parsed2.seenAt = entry.seenAt;
      }
      result[id] = parsed2;
    }
  }
  return result;
}
async function readFromDisk() {
  try {
    const content = await readFile(getFlaggedPluginsPath(), {
      encoding: "utf-8"
    });
    return parsePluginsData(content);
  } catch {
    return {};
  }
}
async function writeToDisk(plugins) {
  const filePath = getFlaggedPluginsPath();
  const tempPath = `${filePath}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await getFsImplementation().mkdir(getPluginsDirectory());
    const content = jsonStringify({ plugins }, null, 2);
    await writeFile(tempPath, content, {
      encoding: "utf-8",
      mode: 384
    });
    await rename(tempPath, filePath);
    cache = plugins;
  } catch (error) {
    logError(error);
    try {
      await unlink(tempPath);
    } catch {
    }
  }
}
async function loadFlaggedPlugins() {
  const all = await readFromDisk();
  const now = Date.now();
  let changed = false;
  for (const [id, entry] of Object.entries(all)) {
    if (entry.seenAt && now - new Date(entry.seenAt).getTime() >= SEEN_EXPIRY_MS) {
      delete all[id];
      changed = true;
    }
  }
  cache = all;
  if (changed) {
    await writeToDisk(all);
  }
}
function getFlaggedPlugins() {
  return cache ?? {};
}
async function addFlaggedPlugin(pluginId) {
  if (cache === null) {
    cache = await readFromDisk();
  }
  const updated = {
    ...cache,
    [pluginId]: {
      flaggedAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
  await writeToDisk(updated);
  logForDebugging(`Flagged plugin: ${pluginId}`);
}
async function markFlaggedPluginsSeen(pluginIds) {
  if (cache === null) {
    cache = await readFromDisk();
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  let changed = false;
  const updated = { ...cache };
  for (const id of pluginIds) {
    const entry = updated[id];
    if (entry && !entry.seenAt) {
      updated[id] = { ...entry, seenAt: now };
      changed = true;
    }
  }
  if (changed) {
    await writeToDisk(updated);
  }
}
async function removeFlaggedPlugin(pluginId) {
  if (cache === null) {
    cache = await readFromDisk();
  }
  if (!(pluginId in cache)) return;
  const { [pluginId]: _, ...rest } = cache;
  cache = rest;
  await writeToDisk(rest);
}
export {
  addFlaggedPlugin,
  getFlaggedPlugins,
  loadFlaggedPlugins,
  markFlaggedPluginsSeen,
  removeFlaggedPlugin
};
