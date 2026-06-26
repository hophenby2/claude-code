import { homedir, platform } from "os";
import { join } from "path";
import { getFsImplementation } from "../utils/fsOperations.js";
const PLUGIN_PREFIX = "claude-code-jetbrains-plugin";
const ideNameToDirMap = {
  pycharm: ["PyCharm"],
  intellij: ["IntelliJIdea", "IdeaIC"],
  webstorm: ["WebStorm"],
  phpstorm: ["PhpStorm"],
  rubymine: ["RubyMine"],
  clion: ["CLion"],
  goland: ["GoLand"],
  rider: ["Rider"],
  datagrip: ["DataGrip"],
  appcode: ["AppCode"],
  dataspell: ["DataSpell"],
  aqua: ["Aqua"],
  gateway: ["Gateway"],
  fleet: ["Fleet"],
  androidstudio: ["AndroidStudio"]
};
function buildCommonPluginDirectoryPaths(ideName) {
  const homeDir = homedir();
  const directories = [];
  const idePatterns = ideNameToDirMap[ideName.toLowerCase()];
  if (!idePatterns) {
    return directories;
  }
  const appData = process.env.APPDATA || join(homeDir, "AppData", "Roaming");
  const localAppData = process.env.LOCALAPPDATA || join(homeDir, "AppData", "Local");
  switch (platform()) {
    case "darwin":
      directories.push(
        join(homeDir, "Library", "Application Support", "JetBrains"),
        join(homeDir, "Library", "Application Support")
      );
      if (ideName.toLowerCase() === "androidstudio") {
        directories.push(
          join(homeDir, "Library", "Application Support", "Google")
        );
      }
      break;
    case "win32":
      directories.push(
        join(appData, "JetBrains"),
        join(localAppData, "JetBrains"),
        join(appData)
      );
      if (ideName.toLowerCase() === "androidstudio") {
        directories.push(join(localAppData, "Google"));
      }
      break;
    case "linux":
      directories.push(
        join(homeDir, ".config", "JetBrains"),
        join(homeDir, ".local", "share", "JetBrains")
      );
      for (const pattern of idePatterns) {
        directories.push(join(homeDir, "." + pattern));
      }
      if (ideName.toLowerCase() === "androidstudio") {
        directories.push(join(homeDir, ".config", "Google"));
      }
      break;
    default:
      break;
  }
  return directories;
}
async function detectPluginDirectories(ideName) {
  const foundDirectories = [];
  const fs = getFsImplementation();
  const pluginDirPaths = buildCommonPluginDirectoryPaths(ideName);
  const idePatterns = ideNameToDirMap[ideName.toLowerCase()];
  if (!idePatterns) {
    return foundDirectories;
  }
  const regexes = idePatterns.map((p) => new RegExp("^" + p));
  for (const baseDir of pluginDirPaths) {
    try {
      const entries = await fs.readdir(baseDir);
      for (const regex of regexes) {
        for (const entry of entries) {
          if (!regex.test(entry.name)) continue;
          if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
          const dir = join(baseDir, entry.name);
          if (platform() === "linux") {
            foundDirectories.push(dir);
            continue;
          }
          const pluginDir = join(dir, "plugins");
          try {
            await fs.stat(pluginDir);
            foundDirectories.push(pluginDir);
          } catch {
          }
        }
      }
    } catch {
      continue;
    }
  }
  return foundDirectories.filter(
    (dir, index) => foundDirectories.indexOf(dir) === index
  );
}
async function isJetBrainsPluginInstalled(ideType) {
  const pluginDirs = await detectPluginDirectories(ideType);
  for (const dir of pluginDirs) {
    const pluginPath = join(dir, PLUGIN_PREFIX);
    try {
      await getFsImplementation().stat(pluginPath);
      return true;
    } catch {
    }
  }
  return false;
}
const pluginInstalledCache = /* @__PURE__ */ new Map();
const pluginInstalledPromiseCache = /* @__PURE__ */ new Map();
async function isJetBrainsPluginInstalledMemoized(ideType, forceRefresh = false) {
  if (!forceRefresh) {
    const existing = pluginInstalledPromiseCache.get(ideType);
    if (existing) {
      return existing;
    }
  }
  const promise = isJetBrainsPluginInstalled(ideType).then((result) => {
    pluginInstalledCache.set(ideType, result);
    return result;
  });
  pluginInstalledPromiseCache.set(ideType, promise);
  return promise;
}
async function isJetBrainsPluginInstalledCached(ideType, forceRefresh = false) {
  if (forceRefresh) {
    pluginInstalledCache.delete(ideType);
    pluginInstalledPromiseCache.delete(ideType);
  }
  return isJetBrainsPluginInstalledMemoized(ideType, forceRefresh);
}
function isJetBrainsPluginInstalledCachedSync(ideType) {
  return pluginInstalledCache.get(ideType) ?? false;
}
export {
  isJetBrainsPluginInstalled,
  isJetBrainsPluginInstalledCached,
  isJetBrainsPluginInstalledCachedSync
};
