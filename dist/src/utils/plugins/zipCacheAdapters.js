import { readFile } from "fs/promises";
import { join } from "path";
import { logForDebugging } from "../debug.js";
import { jsonParse, jsonStringify } from "../slowOperations.js";
import { loadKnownMarketplacesConfigSafe } from "./marketplaceManager.js";
import {
  KnownMarketplacesFileSchema,
  PluginMarketplaceSchema
} from "./schemas.js";
import {
  atomicWriteToZipCache,
  getMarketplaceJsonRelativePath,
  getPluginZipCachePath,
  getZipCacheKnownMarketplacesPath
} from "./zipCache.js";
async function readZipCacheKnownMarketplaces() {
  try {
    const content = await readFile(getZipCacheKnownMarketplacesPath(), "utf-8");
    const parsed = KnownMarketplacesFileSchema().safeParse(jsonParse(content));
    if (!parsed.success) {
      logForDebugging(
        `Invalid known_marketplaces.json in zip cache: ${parsed.error.message}`,
        { level: "error" }
      );
      return {};
    }
    return parsed.data;
  } catch {
    return {};
  }
}
async function writeZipCacheKnownMarketplaces(data) {
  await atomicWriteToZipCache(
    getZipCacheKnownMarketplacesPath(),
    jsonStringify(data, null, 2)
  );
}
async function readMarketplaceJson(marketplaceName) {
  const zipCachePath = getPluginZipCachePath();
  if (!zipCachePath) {
    return null;
  }
  const relPath = getMarketplaceJsonRelativePath(marketplaceName);
  const fullPath = join(zipCachePath, relPath);
  try {
    const content = await readFile(fullPath, "utf-8");
    const parsed = jsonParse(content);
    const result = PluginMarketplaceSchema().safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    logForDebugging(
      `Invalid marketplace JSON for ${marketplaceName}: ${result.error}`
    );
    return null;
  } catch {
    return null;
  }
}
async function saveMarketplaceJsonToZipCache(marketplaceName, installLocation) {
  const zipCachePath = getPluginZipCachePath();
  if (!zipCachePath) {
    return;
  }
  const content = await readMarketplaceJsonContent(installLocation);
  if (content !== null) {
    const relPath = getMarketplaceJsonRelativePath(marketplaceName);
    await atomicWriteToZipCache(join(zipCachePath, relPath), content);
  }
}
async function readMarketplaceJsonContent(dir) {
  const candidates = [
    join(dir, ".claude-plugin", "marketplace.json"),
    join(dir, "marketplace.json"),
    dir
    // For URL sources, installLocation IS the marketplace JSON file
  ];
  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf-8");
    } catch {
    }
  }
  return null;
}
async function syncMarketplacesToZipCache() {
  const knownMarketplaces = await loadKnownMarketplacesConfigSafe();
  for (const [name, entry] of Object.entries(knownMarketplaces)) {
    if (!entry.installLocation) continue;
    try {
      await saveMarketplaceJsonToZipCache(name, entry.installLocation);
    } catch (error) {
      logForDebugging(`Failed to save marketplace JSON for ${name}: ${error}`);
    }
  }
  const zipCacheKnownMarketplaces = await readZipCacheKnownMarketplaces();
  const mergedKnownMarketplaces = {
    ...zipCacheKnownMarketplaces,
    ...knownMarketplaces
  };
  await writeZipCacheKnownMarketplaces(mergedKnownMarketplaces);
}
export {
  readMarketplaceJson,
  readZipCacheKnownMarketplaces,
  saveMarketplaceJsonToZipCache,
  syncMarketplacesToZipCache,
  writeZipCacheKnownMarketplaces
};
