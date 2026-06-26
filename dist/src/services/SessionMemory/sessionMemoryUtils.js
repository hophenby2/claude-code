import { isFsInaccessible } from "../../utils/errors.js";
import { getFsImplementation } from "../../utils/fsOperations.js";
import { getSessionMemoryPath } from "../../utils/permissions/filesystem.js";
import { sleep } from "../../utils/sleep.js";
import { logEvent } from "../analytics/index.js";
const EXTRACTION_WAIT_TIMEOUT_MS = 15e3;
const EXTRACTION_STALE_THRESHOLD_MS = 6e4;
const DEFAULT_SESSION_MEMORY_CONFIG = {
  minimumMessageTokensToInit: 1e4,
  minimumTokensBetweenUpdate: 5e3,
  toolCallsBetweenUpdates: 3
};
let sessionMemoryConfig = {
  ...DEFAULT_SESSION_MEMORY_CONFIG
};
let lastSummarizedMessageId;
let extractionStartedAt;
let tokensAtLastExtraction = 0;
let sessionMemoryInitialized = false;
function getLastSummarizedMessageId() {
  return lastSummarizedMessageId;
}
function setLastSummarizedMessageId(messageId) {
  lastSummarizedMessageId = messageId;
}
function markExtractionStarted() {
  extractionStartedAt = Date.now();
}
function markExtractionCompleted() {
  extractionStartedAt = void 0;
}
async function waitForSessionMemoryExtraction() {
  const startTime = Date.now();
  while (extractionStartedAt) {
    const extractionAge = Date.now() - extractionStartedAt;
    if (extractionAge > EXTRACTION_STALE_THRESHOLD_MS) {
      return;
    }
    if (Date.now() - startTime > EXTRACTION_WAIT_TIMEOUT_MS) {
      return;
    }
    await sleep(1e3);
  }
}
async function getSessionMemoryContent() {
  const fs = getFsImplementation();
  const memoryPath = getSessionMemoryPath();
  try {
    const content = await fs.readFile(memoryPath, { encoding: "utf-8" });
    logEvent("tengu_session_memory_loaded", {
      content_length: content.length
    });
    return content;
  } catch (e) {
    if (isFsInaccessible(e)) return null;
    throw e;
  }
}
function setSessionMemoryConfig(config) {
  sessionMemoryConfig = {
    ...sessionMemoryConfig,
    ...config
  };
}
function getSessionMemoryConfig() {
  return { ...sessionMemoryConfig };
}
function recordExtractionTokenCount(currentTokenCount) {
  tokensAtLastExtraction = currentTokenCount;
}
function isSessionMemoryInitialized() {
  return sessionMemoryInitialized;
}
function markSessionMemoryInitialized() {
  sessionMemoryInitialized = true;
}
function hasMetInitializationThreshold(currentTokenCount) {
  return currentTokenCount >= sessionMemoryConfig.minimumMessageTokensToInit;
}
function hasMetUpdateThreshold(currentTokenCount) {
  const tokensSinceLastExtraction = currentTokenCount - tokensAtLastExtraction;
  return tokensSinceLastExtraction >= sessionMemoryConfig.minimumTokensBetweenUpdate;
}
function getToolCallsBetweenUpdates() {
  return sessionMemoryConfig.toolCallsBetweenUpdates;
}
function resetSessionMemoryState() {
  sessionMemoryConfig = { ...DEFAULT_SESSION_MEMORY_CONFIG };
  tokensAtLastExtraction = 0;
  sessionMemoryInitialized = false;
  lastSummarizedMessageId = void 0;
  extractionStartedAt = void 0;
}
export {
  DEFAULT_SESSION_MEMORY_CONFIG,
  getLastSummarizedMessageId,
  getSessionMemoryConfig,
  getSessionMemoryContent,
  getToolCallsBetweenUpdates,
  hasMetInitializationThreshold,
  hasMetUpdateThreshold,
  isSessionMemoryInitialized,
  markExtractionCompleted,
  markExtractionStarted,
  markSessionMemoryInitialized,
  recordExtractionTokenCount,
  resetSessionMemoryState,
  setLastSummarizedMessageId,
  setSessionMemoryConfig,
  waitForSessionMemoryExtraction
};
