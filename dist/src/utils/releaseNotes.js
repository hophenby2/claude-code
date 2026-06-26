import axios from "axios";
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { coerce } from "semver";
import { getIsNonInteractiveSession } from "../bootstrap/state.js";
import { getGlobalConfig, saveGlobalConfig } from "./config.js";
import { getClaudeConfigHomeDir } from "./envUtils.js";
import { toError } from "./errors.js";
import { logError } from "./log.js";
import { isEssentialTrafficOnly } from "./privacyLevel.js";
import { gt } from "./semver.js";
const MAX_RELEASE_NOTES_SHOWN = 5;
const CHANGELOG_URL = "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md";
const RAW_CHANGELOG_URL = "https://raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/CHANGELOG.md";
function getChangelogCachePath() {
  return join(getClaudeConfigHomeDir(), "cache", "changelog.md");
}
let changelogMemoryCache = null;
function _resetChangelogCacheForTesting() {
  changelogMemoryCache = null;
}
async function migrateChangelogFromConfig() {
  const config = getGlobalConfig();
  if (!config.cachedChangelog) {
    return;
  }
  const cachePath = getChangelogCachePath();
  try {
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, config.cachedChangelog, {
      encoding: "utf-8",
      flag: "wx"
      // Write only if file doesn't exist
    });
  } catch {
  }
  saveGlobalConfig(({ cachedChangelog: _, ...rest }) => rest);
}
async function fetchAndStoreChangelog() {
  if (getIsNonInteractiveSession()) {
    return;
  }
  if (isEssentialTrafficOnly()) {
    return;
  }
  const response = await axios.get(RAW_CHANGELOG_URL);
  if (response.status === 200) {
    const changelogContent = response.data;
    if (changelogContent === changelogMemoryCache) {
      return;
    }
    const cachePath = getChangelogCachePath();
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, changelogContent, { encoding: "utf-8" });
    changelogMemoryCache = changelogContent;
    const changelogLastFetched = Date.now();
    saveGlobalConfig((current) => ({
      ...current,
      changelogLastFetched
    }));
  }
}
async function getStoredChangelog() {
  if (changelogMemoryCache !== null) {
    return changelogMemoryCache;
  }
  const cachePath = getChangelogCachePath();
  try {
    const content = await readFile(cachePath, "utf-8");
    changelogMemoryCache = content;
    return content;
  } catch {
    changelogMemoryCache = "";
    return "";
  }
}
function getStoredChangelogFromMemory() {
  return changelogMemoryCache ?? "";
}
function parseChangelog(content) {
  try {
    if (!content) return {};
    const releaseNotes = {};
    const sections = content.split(/^## /gm).slice(1);
    for (const section of sections) {
      const lines = section.trim().split("\n");
      if (lines.length === 0) continue;
      const versionLine = lines[0];
      if (!versionLine) continue;
      const version = versionLine.split(" - ")[0]?.trim() || "";
      if (!version) continue;
      const notes = lines.slice(1).filter((line) => line.trim().startsWith("- ")).map((line) => line.trim().substring(2).trim()).filter(Boolean);
      if (notes.length > 0) {
        releaseNotes[version] = notes;
      }
    }
    return releaseNotes;
  } catch (error) {
    logError(toError(error));
    return {};
  }
}
function getRecentReleaseNotes(currentVersion, previousVersion, changelogContent = getStoredChangelogFromMemory()) {
  try {
    const releaseNotes = parseChangelog(changelogContent);
    const baseCurrentVersion = coerce(currentVersion);
    const basePreviousVersion = previousVersion ? coerce(previousVersion) : null;
    if (!basePreviousVersion || baseCurrentVersion && gt(baseCurrentVersion.version, basePreviousVersion.version)) {
      return Object.entries(releaseNotes).filter(
        ([version]) => !basePreviousVersion || gt(version, basePreviousVersion.version)
      ).sort(([versionA], [versionB]) => gt(versionA, versionB) ? -1 : 1).flatMap(([_, notes]) => notes).filter(Boolean).slice(0, MAX_RELEASE_NOTES_SHOWN);
    }
  } catch (error) {
    logError(toError(error));
    return [];
  }
  return [];
}
function getAllReleaseNotes(changelogContent = getStoredChangelogFromMemory()) {
  try {
    const releaseNotes = parseChangelog(changelogContent);
    const sortedVersions = Object.keys(releaseNotes).sort(
      (a, b) => gt(a, b) ? 1 : -1
    );
    return sortedVersions.map((version) => {
      const versionNotes = releaseNotes[version];
      if (!versionNotes || versionNotes.length === 0) return null;
      const notes = versionNotes.filter(Boolean);
      if (notes.length === 0) return null;
      return [version, notes];
    }).filter((item) => item !== null);
  } catch (error) {
    logError(toError(error));
    return [];
  }
}
async function checkForReleaseNotes(lastSeenVersion, currentVersion = "0.0.0") {
  if (process.env.USER_TYPE === "ant") {
    const changelog = "";
    if (changelog) {
      const commits = changelog.trim().split("\n").filter(Boolean);
      return {
        hasReleaseNotes: commits.length > 0,
        releaseNotes: commits
      };
    }
    return {
      hasReleaseNotes: false,
      releaseNotes: []
    };
  }
  const cachedChangelog = await getStoredChangelog();
  if (lastSeenVersion !== currentVersion || !cachedChangelog) {
    fetchAndStoreChangelog().catch((error) => logError(toError(error)));
  }
  const releaseNotes = getRecentReleaseNotes(
    currentVersion,
    lastSeenVersion,
    cachedChangelog
  );
  const hasReleaseNotes = releaseNotes.length > 0;
  return {
    hasReleaseNotes,
    releaseNotes
  };
}
function checkForReleaseNotesSync(lastSeenVersion, currentVersion = "0.0.0") {
  if (process.env.USER_TYPE === "ant") {
    const changelog = "";
    if (changelog) {
      const commits = changelog.trim().split("\n").filter(Boolean);
      return {
        hasReleaseNotes: commits.length > 0,
        releaseNotes: commits
      };
    }
    return {
      hasReleaseNotes: false,
      releaseNotes: []
    };
  }
  const releaseNotes = getRecentReleaseNotes(currentVersion, lastSeenVersion);
  return {
    hasReleaseNotes: releaseNotes.length > 0,
    releaseNotes
  };
}
export {
  CHANGELOG_URL,
  _resetChangelogCacheForTesting,
  checkForReleaseNotes,
  checkForReleaseNotesSync,
  fetchAndStoreChangelog,
  getAllReleaseNotes,
  getRecentReleaseNotes,
  getStoredChangelog,
  getStoredChangelogFromMemory,
  migrateChangelogFromConfig,
  parseChangelog
};
