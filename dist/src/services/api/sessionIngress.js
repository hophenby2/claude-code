import axios from "axios";
import { getOauthConfig } from "../../constants/oauth.js";
import { logForDebugging } from "../../utils/debug.js";
import { logForDiagnosticsNoPII } from "../../utils/diagLogs.js";
import { isEnvTruthy } from "../../utils/envUtils.js";
import { logError } from "../../utils/log.js";
import { sequential } from "../../utils/sequential.js";
import { getSessionIngressAuthToken } from "../../utils/sessionIngressAuth.js";
import { sleep } from "../../utils/sleep.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import { getOAuthHeaders } from "../../utils/teleport/api.js";
const lastUuidMap = /* @__PURE__ */ new Map();
const MAX_RETRIES = 10;
const BASE_DELAY_MS = 500;
const sequentialAppendBySession = /* @__PURE__ */ new Map();
function getOrCreateSequentialAppend(sessionId) {
  let sequentialAppend = sequentialAppendBySession.get(sessionId);
  if (!sequentialAppend) {
    sequentialAppend = sequential(
      async (entry, url, headers) => await appendSessionLogImpl(sessionId, entry, url, headers)
    );
    sequentialAppendBySession.set(sessionId, sequentialAppend);
  }
  return sequentialAppend;
}
async function appendSessionLogImpl(sessionId, entry, url, headers) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const lastUuid = lastUuidMap.get(sessionId);
      const requestHeaders = { ...headers };
      if (lastUuid) {
        requestHeaders["Last-Uuid"] = lastUuid;
      }
      const response = await axios.put(url, entry, {
        headers: requestHeaders,
        validateStatus: (status) => status < 500
      });
      if (response.status === 200 || response.status === 201) {
        lastUuidMap.set(sessionId, entry.uuid);
        logForDebugging(
          `Successfully persisted session log entry for session ${sessionId}`
        );
        return true;
      }
      if (response.status === 409) {
        const serverLastUuid = response.headers["x-last-uuid"];
        if (serverLastUuid === entry.uuid) {
          lastUuidMap.set(sessionId, entry.uuid);
          logForDebugging(
            `Session entry ${entry.uuid} already present on server, recovering from stale state`
          );
          logForDiagnosticsNoPII("info", "session_persist_recovered_from_409");
          return true;
        }
        if (serverLastUuid) {
          lastUuidMap.set(sessionId, serverLastUuid);
          logForDebugging(
            `Session 409: adopting server lastUuid=${serverLastUuid} from header, retrying entry ${entry.uuid}`
          );
        } else {
          const logs = await fetchSessionLogsFromUrl(sessionId, url, headers);
          const adoptedUuid = findLastUuid(logs);
          if (adoptedUuid) {
            lastUuidMap.set(sessionId, adoptedUuid);
            logForDebugging(
              `Session 409: re-fetched ${logs.length} entries, adopting lastUuid=${adoptedUuid}, retrying entry ${entry.uuid}`
            );
          } else {
            const errorData = response.data;
            const errorMessage = errorData.error?.message || "Concurrent modification detected";
            logError(
              new Error(
                `Session persistence conflict: UUID mismatch for session ${sessionId}, entry ${entry.uuid}. ${errorMessage}`
              )
            );
            logForDiagnosticsNoPII(
              "error",
              "session_persist_fail_concurrent_modification"
            );
            return false;
          }
        }
        logForDiagnosticsNoPII("info", "session_persist_409_adopt_server_uuid");
        continue;
      }
      if (response.status === 401) {
        logForDebugging("Session token expired or invalid");
        logForDiagnosticsNoPII("error", "session_persist_fail_bad_token");
        return false;
      }
      logForDebugging(
        `Failed to persist session log: ${response.status} ${response.statusText}`
      );
      logForDiagnosticsNoPII("error", "session_persist_fail_status", {
        status: response.status,
        attempt
      });
    } catch (error) {
      const axiosError = error;
      logError(new Error(`Error persisting session log: ${axiosError.message}`));
      logForDiagnosticsNoPII("error", "session_persist_fail_status", {
        status: axiosError.status,
        attempt
      });
    }
    if (attempt === MAX_RETRIES) {
      logForDebugging(`Remote persistence failed after ${MAX_RETRIES} attempts`);
      logForDiagnosticsNoPII(
        "error",
        "session_persist_error_retries_exhausted",
        { attempt }
      );
      return false;
    }
    const delayMs = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), 8e3);
    logForDebugging(
      `Remote persistence attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${delayMs}ms\u2026`
    );
    await sleep(delayMs);
  }
  return false;
}
async function appendSessionLog(sessionId, entry, url) {
  const sessionToken = getSessionIngressAuthToken();
  if (!sessionToken) {
    logForDebugging("No session token available for session persistence");
    logForDiagnosticsNoPII("error", "session_persist_fail_jwt_no_token");
    return false;
  }
  const headers = {
    Authorization: `Bearer ${sessionToken}`,
    "Content-Type": "application/json"
  };
  const sequentialAppend = getOrCreateSequentialAppend(sessionId);
  return sequentialAppend(entry, url, headers);
}
async function getSessionLogs(sessionId, url) {
  const sessionToken = getSessionIngressAuthToken();
  if (!sessionToken) {
    logForDebugging("No session token available for fetching session logs");
    logForDiagnosticsNoPII("error", "session_get_fail_no_token");
    return null;
  }
  const headers = { Authorization: `Bearer ${sessionToken}` };
  const logs = await fetchSessionLogsFromUrl(sessionId, url, headers);
  if (logs && logs.length > 0) {
    const lastEntry = logs.at(-1);
    if (lastEntry && "uuid" in lastEntry && lastEntry.uuid) {
      lastUuidMap.set(sessionId, lastEntry.uuid);
    }
  }
  return logs;
}
async function getSessionLogsViaOAuth(sessionId, accessToken, orgUUID) {
  const url = `${getOauthConfig().BASE_API_URL}/v1/session_ingress/session/${sessionId}`;
  logForDebugging(`[session-ingress] Fetching session logs from: ${url}`);
  const headers = {
    ...getOAuthHeaders(accessToken),
    "x-organization-uuid": orgUUID
  };
  const result = await fetchSessionLogsFromUrl(sessionId, url, headers);
  return result;
}
async function getTeleportEvents(sessionId, accessToken, orgUUID) {
  const baseUrl = `${getOauthConfig().BASE_API_URL}/v1/code/sessions/${sessionId}/teleport-events`;
  const headers = {
    ...getOAuthHeaders(accessToken),
    "x-organization-uuid": orgUUID
  };
  logForDebugging(`[teleport] Fetching events from: ${baseUrl}`);
  const all = [];
  let cursor;
  let pages = 0;
  const maxPages = 100;
  while (pages < maxPages) {
    const params = { limit: 1e3 };
    if (cursor !== void 0) {
      params.cursor = cursor;
    }
    let response;
    try {
      response = await axios.get(baseUrl, {
        headers,
        params,
        timeout: 2e4,
        validateStatus: (status) => status < 500
      });
    } catch (e) {
      const err = e;
      logError(new Error(`Teleport events fetch failed: ${err.message}`));
      logForDiagnosticsNoPII("error", "teleport_events_fetch_fail");
      return null;
    }
    if (response.status === 404) {
      logForDebugging(
        `[teleport] Session ${sessionId} not found (page ${pages})`
      );
      logForDiagnosticsNoPII("warn", "teleport_events_not_found");
      return pages === 0 ? null : all;
    }
    if (response.status === 401) {
      logForDiagnosticsNoPII("error", "teleport_events_bad_token");
      throw new Error(
        "Your session has expired. Please run /login to sign in again."
      );
    }
    if (response.status !== 200) {
      logError(
        new Error(
          `Teleport events returned ${response.status}: ${jsonStringify(response.data)}`
        )
      );
      logForDiagnosticsNoPII("error", "teleport_events_bad_status");
      return null;
    }
    const { data, next_cursor } = response.data;
    if (!Array.isArray(data)) {
      logError(
        new Error(
          `Teleport events invalid response shape: ${jsonStringify(response.data)}`
        )
      );
      logForDiagnosticsNoPII("error", "teleport_events_invalid_shape");
      return null;
    }
    for (const ev of data) {
      if (ev.payload !== null) {
        all.push(ev.payload);
      }
    }
    pages++;
    if (next_cursor == null) {
      break;
    }
    cursor = next_cursor;
  }
  if (pages >= maxPages) {
    logError(
      new Error(`Teleport events hit page cap (${maxPages}) for ${sessionId}`)
    );
    logForDiagnosticsNoPII("warn", "teleport_events_page_cap");
  }
  logForDebugging(
    `[teleport] Fetched ${all.length} events over ${pages} page(s) for ${sessionId}`
  );
  return all;
}
async function fetchSessionLogsFromUrl(sessionId, url, headers) {
  try {
    const response = await axios.get(url, {
      headers,
      timeout: 2e4,
      validateStatus: (status) => status < 500,
      params: isEnvTruthy(process.env.CLAUDE_AFTER_LAST_COMPACT) ? { after_last_compact: true } : void 0
    });
    if (response.status === 200) {
      const data = response.data;
      if (!data || typeof data !== "object" || !Array.isArray(data.loglines)) {
        logError(
          new Error(
            `Invalid session logs response format: ${jsonStringify(data)}`
          )
        );
        logForDiagnosticsNoPII("error", "session_get_fail_invalid_response");
        return null;
      }
      const logs = data.loglines;
      logForDebugging(
        `Fetched ${logs.length} session logs for session ${sessionId}`
      );
      return logs;
    }
    if (response.status === 404) {
      logForDebugging(`No existing logs for session ${sessionId}`);
      logForDiagnosticsNoPII("warn", "session_get_no_logs_for_session");
      return [];
    }
    if (response.status === 401) {
      logForDebugging("Auth token expired or invalid");
      logForDiagnosticsNoPII("error", "session_get_fail_bad_token");
      throw new Error(
        "Your session has expired. Please run /login to sign in again."
      );
    }
    logForDebugging(
      `Failed to fetch session logs: ${response.status} ${response.statusText}`
    );
    logForDiagnosticsNoPII("error", "session_get_fail_status", {
      status: response.status
    });
    return null;
  } catch (error) {
    const axiosError = error;
    logError(new Error(`Error fetching session logs: ${axiosError.message}`));
    logForDiagnosticsNoPII("error", "session_get_fail_status", {
      status: axiosError.status
    });
    return null;
  }
}
function findLastUuid(logs) {
  if (!logs) {
    return void 0;
  }
  const entry = logs.findLast((e) => "uuid" in e && e.uuid);
  return entry && "uuid" in entry ? entry.uuid : void 0;
}
function clearSession(sessionId) {
  lastUuidMap.delete(sessionId);
  sequentialAppendBySession.delete(sessionId);
}
function clearAllSessions() {
  lastUuidMap.clear();
  sequentialAppendBySession.clear();
}
export {
  appendSessionLog,
  clearAllSessions,
  clearSession,
  getSessionLogs,
  getSessionLogsViaOAuth,
  getTeleportEvents
};
