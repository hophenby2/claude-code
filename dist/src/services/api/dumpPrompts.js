import { createHash } from "crypto";
import { promises as fs } from "fs";
import { dirname, join } from "path";
import { getSessionId } from "../../bootstrap/state.js";
import { getClaudeConfigHomeDir } from "../../utils/envUtils.js";
import { jsonParse, jsonStringify } from "../../utils/slowOperations.js";
function hashString(str) {
  return createHash("sha256").update(str).digest("hex");
}
const MAX_CACHED_REQUESTS = 5;
const cachedApiRequests = [];
const dumpState = /* @__PURE__ */ new Map();
function getLastApiRequests() {
  return [...cachedApiRequests];
}
function clearApiRequestCache() {
  cachedApiRequests.length = 0;
}
function clearDumpState(agentIdOrSessionId) {
  dumpState.delete(agentIdOrSessionId);
}
function clearAllDumpState() {
  dumpState.clear();
}
function addApiRequestToCache(requestData) {
  if (process.env.USER_TYPE !== "ant") return;
  cachedApiRequests.push({
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    request: requestData
  });
  if (cachedApiRequests.length > MAX_CACHED_REQUESTS) {
    cachedApiRequests.shift();
  }
}
function getDumpPromptsPath(agentIdOrSessionId) {
  return join(
    getClaudeConfigHomeDir(),
    "dump-prompts",
    `${agentIdOrSessionId ?? getSessionId()}.jsonl`
  );
}
function appendToFile(filePath, entries) {
  if (entries.length === 0) return;
  fs.mkdir(dirname(filePath), { recursive: true }).then(() => fs.appendFile(filePath, entries.join("\n") + "\n")).catch(() => {
  });
}
function initFingerprint(req) {
  const tools = req.tools;
  const system = req.system;
  const sysLen = typeof system === "string" ? system.length : Array.isArray(system) ? system.reduce(
    (n, b) => n + (b.text?.length ?? 0),
    0
  ) : 0;
  const toolNames = tools?.map((t) => t.name ?? "").join(",") ?? "";
  return `${req.model}|${toolNames}|${sysLen}`;
}
function dumpRequest(body, ts, state, filePath) {
  try {
    const req = jsonParse(body);
    addApiRequestToCache(req);
    if (process.env.USER_TYPE !== "ant") return;
    const entries = [];
    const messages = req.messages ?? [];
    const fingerprint = initFingerprint(req);
    if (!state.initialized || fingerprint !== state.lastInitFingerprint) {
      const { messages: _, ...initData } = req;
      const initDataStr = jsonStringify(initData);
      const initDataHash = hashString(initDataStr);
      state.lastInitFingerprint = fingerprint;
      if (!state.initialized) {
        state.initialized = true;
        state.lastInitDataHash = initDataHash;
        entries.push(
          `{"type":"init","timestamp":"${ts}","data":${initDataStr}}`
        );
      } else if (initDataHash !== state.lastInitDataHash) {
        state.lastInitDataHash = initDataHash;
        entries.push(
          `{"type":"system_update","timestamp":"${ts}","data":${initDataStr}}`
        );
      }
    }
    for (const msg of messages.slice(state.messageCountSeen)) {
      if (msg.role === "user") {
        entries.push(
          jsonStringify({ type: "message", timestamp: ts, data: msg })
        );
      }
    }
    state.messageCountSeen = messages.length;
    appendToFile(filePath, entries);
  } catch {
  }
}
function createDumpPromptsFetch(agentIdOrSessionId) {
  const filePath = getDumpPromptsPath(agentIdOrSessionId);
  return async (input, init) => {
    const state = dumpState.get(agentIdOrSessionId) ?? {
      initialized: false,
      messageCountSeen: 0,
      lastInitDataHash: "",
      lastInitFingerprint: ""
    };
    dumpState.set(agentIdOrSessionId, state);
    let timestamp;
    if (init?.method === "POST" && init.body) {
      timestamp = (/* @__PURE__ */ new Date()).toISOString();
      setImmediate(dumpRequest, init.body, timestamp, state, filePath);
    }
    const response = await globalThis.fetch(input, init);
    if (timestamp && response.ok && process.env.USER_TYPE === "ant") {
      const cloned = response.clone();
      void (async () => {
        try {
          const isStreaming = cloned.headers.get("content-type")?.includes("text/event-stream");
          let data;
          if (isStreaming && cloned.body) {
            const reader = cloned.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
              }
            } finally {
              reader.releaseLock();
            }
            const chunks = [];
            for (const event of buffer.split("\n\n")) {
              for (const line of event.split("\n")) {
                if (line.startsWith("data: ") && line !== "data: [DONE]") {
                  try {
                    chunks.push(jsonParse(line.slice(6)));
                  } catch {
                  }
                }
              }
            }
            data = { stream: true, chunks };
          } else {
            data = await cloned.json();
          }
          await fs.appendFile(
            filePath,
            jsonStringify({ type: "response", timestamp, data }) + "\n"
          );
        } catch {
        }
      })();
    }
    return response;
  };
}
export {
  addApiRequestToCache,
  clearAllDumpState,
  clearApiRequestCache,
  clearDumpState,
  createDumpPromptsFetch,
  getDumpPromptsPath,
  getLastApiRequests
};
