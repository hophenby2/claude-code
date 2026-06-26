import { appendFile, writeFile } from "fs/promises";
import { join } from "path";
import { getProjectRoot, getSessionId } from "./bootstrap/state.js";
import { registerCleanup } from "./utils/cleanupRegistry.js";
import { logForDebugging } from "./utils/debug.js";
import { getClaudeConfigHomeDir, isEnvTruthy } from "./utils/envUtils.js";
import { getErrnoCode } from "./utils/errors.js";
import { readLinesReverse } from "./utils/fsOperations.js";
import { lock } from "./utils/lockfile.js";
import {
  hashPastedText,
  retrievePastedText,
  storePastedText
} from "./utils/pasteStore.js";
import { sleep } from "./utils/sleep.js";
import { jsonParse, jsonStringify } from "./utils/slowOperations.js";
const MAX_HISTORY_ITEMS = 100;
const MAX_PASTED_CONTENT_LENGTH = 1024;
function getPastedTextRefNumLines(text) {
  return (text.match(/\r\n|\r|\n/g) || []).length;
}
function formatPastedTextRef(id, numLines) {
  if (numLines === 0) {
    return `[Pasted text #${id}]`;
  }
  return `[Pasted text #${id} +${numLines} lines]`;
}
function formatImageRef(id) {
  return `[Image #${id}]`;
}
function parseReferences(input) {
  const referencePattern = /\[(Pasted text|Image|\.\.\.Truncated text) #(\d+)(?: \+\d+ lines)?(\.)*\]/g;
  const matches = [...input.matchAll(referencePattern)];
  return matches.map((match) => ({
    id: parseInt(match[2] || "0"),
    match: match[0],
    index: match.index
  })).filter((match) => match.id > 0);
}
function expandPastedTextRefs(input, pastedContents) {
  const refs = parseReferences(input);
  let expanded = input;
  for (let i = refs.length - 1; i >= 0; i--) {
    const ref = refs[i];
    const content = pastedContents[ref.id];
    if (content?.type !== "text") continue;
    expanded = expanded.slice(0, ref.index) + content.content + expanded.slice(ref.index + ref.match.length);
  }
  return expanded;
}
function deserializeLogEntry(line) {
  return jsonParse(line);
}
async function* makeLogEntryReader() {
  const currentSession = getSessionId();
  for (let i = pendingEntries.length - 1; i >= 0; i--) {
    yield pendingEntries[i];
  }
  const historyPath = join(getClaudeConfigHomeDir(), "history.jsonl");
  try {
    for await (const line of readLinesReverse(historyPath)) {
      try {
        const entry = deserializeLogEntry(line);
        if (entry.sessionId === currentSession && skippedTimestamps.has(entry.timestamp)) {
          continue;
        }
        yield entry;
      } catch (error) {
        logForDebugging(`Failed to parse history line: ${error}`);
      }
    }
  } catch (e) {
    const code = getErrnoCode(e);
    if (code === "ENOENT") {
      return;
    }
    throw e;
  }
}
async function* makeHistoryReader() {
  for await (const entry of makeLogEntryReader()) {
    yield await logEntryToHistoryEntry(entry);
  }
}
async function* getTimestampedHistory() {
  const currentProject = getProjectRoot();
  const seen = /* @__PURE__ */ new Set();
  for await (const entry of makeLogEntryReader()) {
    if (!entry || typeof entry.project !== "string") continue;
    if (entry.project !== currentProject) continue;
    if (seen.has(entry.display)) continue;
    seen.add(entry.display);
    yield {
      display: entry.display,
      timestamp: entry.timestamp,
      resolve: () => logEntryToHistoryEntry(entry)
    };
    if (seen.size >= MAX_HISTORY_ITEMS) return;
  }
}
async function* getHistory() {
  const currentProject = getProjectRoot();
  const currentSession = getSessionId();
  const otherSessionEntries = [];
  let yielded = 0;
  for await (const entry of makeLogEntryReader()) {
    if (!entry || typeof entry.project !== "string") continue;
    if (entry.project !== currentProject) continue;
    if (entry.sessionId === currentSession) {
      yield await logEntryToHistoryEntry(entry);
      yielded++;
    } else {
      otherSessionEntries.push(entry);
    }
    if (yielded + otherSessionEntries.length >= MAX_HISTORY_ITEMS) break;
  }
  for (const entry of otherSessionEntries) {
    if (yielded >= MAX_HISTORY_ITEMS) return;
    yield await logEntryToHistoryEntry(entry);
    yielded++;
  }
}
async function resolveStoredPastedContent(stored) {
  if (stored.content) {
    return {
      id: stored.id,
      type: stored.type,
      content: stored.content,
      mediaType: stored.mediaType,
      filename: stored.filename
    };
  }
  if (stored.contentHash) {
    const content = await retrievePastedText(stored.contentHash);
    if (content) {
      return {
        id: stored.id,
        type: stored.type,
        content,
        mediaType: stored.mediaType,
        filename: stored.filename
      };
    }
  }
  return null;
}
async function logEntryToHistoryEntry(entry) {
  const pastedContents = {};
  for (const [id, stored] of Object.entries(entry.pastedContents || {})) {
    const resolved = await resolveStoredPastedContent(stored);
    if (resolved) {
      pastedContents[Number(id)] = resolved;
    }
  }
  return {
    display: entry.display,
    pastedContents
  };
}
let pendingEntries = [];
let isWriting = false;
let currentFlushPromise = null;
let cleanupRegistered = false;
let lastAddedEntry = null;
const skippedTimestamps = /* @__PURE__ */ new Set();
async function immediateFlushHistory() {
  if (pendingEntries.length === 0) {
    return;
  }
  let release;
  try {
    const historyPath = join(getClaudeConfigHomeDir(), "history.jsonl");
    await writeFile(historyPath, "", {
      encoding: "utf8",
      mode: 384,
      flag: "a"
    });
    release = await lock(historyPath, {
      stale: 1e4,
      retries: {
        retries: 3,
        minTimeout: 50
      }
    });
    const jsonLines = pendingEntries.map((entry) => jsonStringify(entry) + "\n");
    pendingEntries = [];
    await appendFile(historyPath, jsonLines.join(""), { mode: 384 });
  } catch (error) {
    logForDebugging(`Failed to write prompt history: ${error}`);
  } finally {
    if (release) {
      await release();
    }
  }
}
async function flushPromptHistory(retries) {
  if (isWriting || pendingEntries.length === 0) {
    return;
  }
  if (retries > 5) {
    return;
  }
  isWriting = true;
  try {
    await immediateFlushHistory();
  } finally {
    isWriting = false;
    if (pendingEntries.length > 0) {
      await sleep(500);
      void flushPromptHistory(retries + 1);
    }
  }
}
async function addToPromptHistory(command) {
  const entry = typeof command === "string" ? { display: command, pastedContents: {} } : command;
  const storedPastedContents = {};
  if (entry.pastedContents) {
    for (const [id, content] of Object.entries(entry.pastedContents)) {
      if (content.type === "image") {
        continue;
      }
      if (content.content.length <= MAX_PASTED_CONTENT_LENGTH) {
        storedPastedContents[Number(id)] = {
          id: content.id,
          type: content.type,
          content: content.content,
          mediaType: content.mediaType,
          filename: content.filename
        };
      } else {
        const hash = hashPastedText(content.content);
        storedPastedContents[Number(id)] = {
          id: content.id,
          type: content.type,
          contentHash: hash,
          mediaType: content.mediaType,
          filename: content.filename
        };
        void storePastedText(hash, content.content);
      }
    }
  }
  const logEntry = {
    ...entry,
    pastedContents: storedPastedContents,
    timestamp: Date.now(),
    project: getProjectRoot(),
    sessionId: getSessionId()
  };
  pendingEntries.push(logEntry);
  lastAddedEntry = logEntry;
  currentFlushPromise = flushPromptHistory(0);
  void currentFlushPromise;
}
function addToHistory(command) {
  if (isEnvTruthy(process.env.CLAUDE_CODE_SKIP_PROMPT_HISTORY)) {
    return;
  }
  if (!cleanupRegistered) {
    cleanupRegistered = true;
    registerCleanup(async () => {
      if (currentFlushPromise) {
        await currentFlushPromise;
      }
      if (pendingEntries.length > 0) {
        await immediateFlushHistory();
      }
    });
  }
  void addToPromptHistory(command);
}
function clearPendingHistoryEntries() {
  pendingEntries = [];
  lastAddedEntry = null;
  skippedTimestamps.clear();
}
function removeLastFromHistory() {
  if (!lastAddedEntry) return;
  const entry = lastAddedEntry;
  lastAddedEntry = null;
  const idx = pendingEntries.lastIndexOf(entry);
  if (idx !== -1) {
    pendingEntries.splice(idx, 1);
  } else {
    skippedTimestamps.add(entry.timestamp);
  }
}
export {
  addToHistory,
  clearPendingHistoryEntries,
  expandPastedTextRefs,
  formatImageRef,
  formatPastedTextRef,
  getHistory,
  getPastedTextRefNumLines,
  getTimestampedHistory,
  makeHistoryReader,
  parseReferences,
  removeLastFromHistory
};
