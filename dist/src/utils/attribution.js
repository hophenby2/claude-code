const feature = (_name) => false;
import { stat } from "fs/promises";
import { getClientType } from "../bootstrap/state.js";
import {
  getRemoteSessionUrl,
  isRemoteSessionLocal,
  PRODUCT_URL
} from "../constants/product.js";
import { TERMINAL_OUTPUT_TAGS } from "../constants/xml.js";
import { FILE_EDIT_TOOL_NAME } from "../tools/FileEditTool/constants.js";
import { FILE_READ_TOOL_NAME } from "../tools/FileReadTool/prompt.js";
import { FILE_WRITE_TOOL_NAME } from "../tools/FileWriteTool/prompt.js";
import { GLOB_TOOL_NAME } from "../tools/GlobTool/prompt.js";
import { GREP_TOOL_NAME } from "../tools/GrepTool/prompt.js";
import {
  calculateCommitAttribution,
  isInternalModelRepo,
  isInternalModelRepoCached,
  sanitizeModelName
} from "./commitAttribution.js";
import { logForDebugging } from "./debug.js";
import { parseJSONL } from "./json.js";
import { logError } from "./log.js";
import {
  getCanonicalName,
  getMainLoopModel,
  getPublicModelDisplayName,
  getPublicModelName
} from "./model/model.js";
import { isMemoryFileAccess } from "./sessionFileAccessHooks.js";
import { getTranscriptPath } from "./sessionStorage.js";
import { readTranscriptForLoad } from "./sessionStoragePortable.js";
import { getInitialSettings } from "./settings/settings.js";
import { isUndercover } from "./undercover.js";
function getAttributionTexts() {
  if (process.env.USER_TYPE === "ant" && isUndercover()) {
    return { commit: "", pr: "" };
  }
  if (getClientType() === "remote") {
    const remoteSessionId = process.env.CLAUDE_CODE_REMOTE_SESSION_ID;
    if (remoteSessionId) {
      const ingressUrl = process.env.SESSION_INGRESS_URL;
      if (!isRemoteSessionLocal(remoteSessionId, ingressUrl)) {
        const sessionUrl = getRemoteSessionUrl(remoteSessionId, ingressUrl);
        return { commit: sessionUrl, pr: sessionUrl };
      }
    }
    return { commit: "", pr: "" };
  }
  const model = getMainLoopModel();
  const isKnownPublicModel = getPublicModelDisplayName(model) !== null;
  const modelName = isInternalModelRepoCached() || isKnownPublicModel ? getPublicModelName(model) : "Claude Opus 4.6";
  const defaultAttribution = `\u{1F916} Generated with [Claude Code](${PRODUCT_URL})`;
  const defaultCommit = `Co-Authored-By: ${modelName} <noreply@anthropic.com>`;
  const settings = getInitialSettings();
  if (settings.attribution) {
    return {
      commit: settings.attribution.commit ?? defaultCommit,
      pr: settings.attribution.pr ?? defaultAttribution
    };
  }
  if (settings.includeCoAuthoredBy === false) {
    return { commit: "", pr: "" };
  }
  return { commit: defaultCommit, pr: defaultAttribution };
}
function isTerminalOutput(content) {
  for (const tag of TERMINAL_OUTPUT_TAGS) {
    if (content.includes(`<${tag}>`)) {
      return true;
    }
  }
  return false;
}
function countUserPromptsInMessages(messages) {
  let count = 0;
  for (const message of messages) {
    if (message.type !== "user") {
      continue;
    }
    const content = message.message?.content;
    if (!content) {
      continue;
    }
    let hasUserText = false;
    if (typeof content === "string") {
      if (isTerminalOutput(content)) {
        continue;
      }
      hasUserText = content.trim().length > 0;
    } else if (Array.isArray(content)) {
      hasUserText = content.some((block) => {
        if (!block || typeof block !== "object" || !("type" in block)) {
          return false;
        }
        return block.type === "text" && typeof block.text === "string" && !isTerminalOutput(block.text) || block.type === "image" || block.type === "document";
      });
    }
    if (hasUserText) {
      count++;
    }
  }
  return count;
}
function countUserPromptsFromEntries(entries) {
  const nonSidechain = entries.filter(
    (entry) => entry.type === "user" && !("isSidechain" in entry && entry.isSidechain)
  );
  return countUserPromptsInMessages(nonSidechain);
}
async function getPRAttributionData(appState) {
  const attribution = appState.attribution;
  if (!attribution) {
    return null;
  }
  const fileStates = attribution.fileStates;
  const isMap = fileStates instanceof Map;
  const trackedFiles = isMap ? Array.from(fileStates.keys()) : Object.keys(fileStates);
  if (trackedFiles.length === 0) {
    return null;
  }
  try {
    return await calculateCommitAttribution([attribution], trackedFiles);
  } catch (error) {
    logError(error);
    return null;
  }
}
const MEMORY_ACCESS_TOOL_NAMES = /* @__PURE__ */ new Set([
  FILE_READ_TOOL_NAME,
  GREP_TOOL_NAME,
  GLOB_TOOL_NAME,
  FILE_EDIT_TOOL_NAME,
  FILE_WRITE_TOOL_NAME
]);
function countMemoryFileAccessFromEntries(entries) {
  let count = 0;
  for (const entry of entries) {
    if (entry.type !== "assistant") continue;
    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type !== "tool_use" || !MEMORY_ACCESS_TOOL_NAMES.has(block.name))
        continue;
      if (isMemoryFileAccess(block.name, block.input)) count++;
    }
  }
  return count;
}
async function getTranscriptStats() {
  try {
    const filePath = getTranscriptPath();
    const fileSize = (await stat(filePath)).size;
    const scan = await readTranscriptForLoad(filePath, fileSize);
    const buf = scan.postBoundaryBuf;
    const entries = parseJSONL(buf);
    const lastBoundaryIdx = entries.findLastIndex(
      (e) => e.type === "system" && "subtype" in e && e.subtype === "compact_boundary"
    );
    const postBoundary = lastBoundaryIdx >= 0 ? entries.slice(lastBoundaryIdx + 1) : entries;
    return {
      promptCount: countUserPromptsFromEntries(postBoundary),
      memoryAccessCount: countMemoryFileAccessFromEntries(postBoundary)
    };
  } catch {
    return { promptCount: 0, memoryAccessCount: 0 };
  }
}
async function getEnhancedPRAttribution(getAppState) {
  if (process.env.USER_TYPE === "ant" && isUndercover()) {
    return "";
  }
  if (getClientType() === "remote") {
    const remoteSessionId = process.env.CLAUDE_CODE_REMOTE_SESSION_ID;
    if (remoteSessionId) {
      const ingressUrl = process.env.SESSION_INGRESS_URL;
      if (!isRemoteSessionLocal(remoteSessionId, ingressUrl)) {
        return getRemoteSessionUrl(remoteSessionId, ingressUrl);
      }
    }
    return "";
  }
  const settings = getInitialSettings();
  if (settings.attribution?.pr) {
    return settings.attribution.pr;
  }
  if (settings.includeCoAuthoredBy === false) {
    return "";
  }
  const defaultAttribution = `\u{1F916} Generated with [Claude Code](${PRODUCT_URL})`;
  const appState = getAppState();
  logForDebugging(
    `PR Attribution: appState.attribution exists: ${!!appState.attribution}`
  );
  if (appState.attribution) {
    const fileStates = appState.attribution.fileStates;
    const isMap = fileStates instanceof Map;
    const fileCount = isMap ? fileStates.size : Object.keys(fileStates).length;
    logForDebugging(`PR Attribution: fileStates count: ${fileCount}`);
  }
  const [attributionData, { promptCount, memoryAccessCount }, isInternal] = await Promise.all([
    getPRAttributionData(appState),
    getTranscriptStats(),
    isInternalModelRepo()
  ]);
  const claudePercent = attributionData?.summary.claudePercent ?? 0;
  logForDebugging(
    `PR Attribution: claudePercent: ${claudePercent}, promptCount: ${promptCount}, memoryAccessCount: ${memoryAccessCount}`
  );
  const rawModelName = getCanonicalName(getMainLoopModel());
  const shortModelName = isInternal ? rawModelName : sanitizeModelName(rawModelName);
  if (claudePercent === 0 && promptCount === 0 && memoryAccessCount === 0) {
    logForDebugging("PR Attribution: returning default (no data)");
    return defaultAttribution;
  }
  const memSuffix = memoryAccessCount > 0 ? `, ${memoryAccessCount} ${memoryAccessCount === 1 ? "memory" : "memories"} recalled` : "";
  const summary = `\u{1F916} Generated with [Claude Code](${PRODUCT_URL}) (${claudePercent}% ${promptCount}-shotted by ${shortModelName}${memSuffix})`;
  if (false) {
    const { buildPRTrailers } = await null;
    const trailers = buildPRTrailers(attributionData, appState.attribution);
    const result = `${summary}

${trailers.join("\n")}`;
    logForDebugging(`PR Attribution: returning with trailers: ${result}`);
    return result;
  }
  logForDebugging(`PR Attribution: returning summary: ${summary}`);
  return summary;
}
export {
  countUserPromptsInMessages,
  getAttributionTexts,
  getEnhancedPRAttribution
};
