import { useCallback, useEffect, useRef } from "react";
import { useInterval } from "usehooks-ts";
import { logForDebugging } from "../utils/debug.js";
import { errorMessage } from "../utils/errors.js";
import {
  permissionUpdateSchema
} from "../utils/permissions/PermissionUpdateSchema.js";
import {
  isSwarmWorker,
  pollForResponse,
  removeWorkerResponse
} from "../utils/swarm/permissionSync.js";
import { getAgentName, getTeamName } from "../utils/teammate.js";
const POLL_INTERVAL_MS = 500;
function parsePermissionUpdates(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  const schema = permissionUpdateSchema();
  const valid = [];
  for (const entry of raw) {
    const result = schema.safeParse(entry);
    if (result.success) {
      valid.push(result.data);
    } else {
      logForDebugging(
        `[SwarmPermissionPoller] Dropping malformed permissionUpdate entry: ${result.error.message}`,
        { level: "warn" }
      );
    }
  }
  return valid;
}
const pendingCallbacks = /* @__PURE__ */ new Map();
function registerPermissionCallback(callback) {
  pendingCallbacks.set(callback.requestId, callback);
  logForDebugging(
    `[SwarmPermissionPoller] Registered callback for request ${callback.requestId}`
  );
}
function unregisterPermissionCallback(requestId) {
  pendingCallbacks.delete(requestId);
  logForDebugging(
    `[SwarmPermissionPoller] Unregistered callback for request ${requestId}`
  );
}
function hasPermissionCallback(requestId) {
  return pendingCallbacks.has(requestId);
}
function clearAllPendingCallbacks() {
  pendingCallbacks.clear();
  pendingSandboxCallbacks.clear();
}
function processMailboxPermissionResponse(params) {
  const callback = pendingCallbacks.get(params.requestId);
  if (!callback) {
    logForDebugging(
      `[SwarmPermissionPoller] No callback registered for mailbox response ${params.requestId}`
    );
    return false;
  }
  logForDebugging(
    `[SwarmPermissionPoller] Processing mailbox response for request ${params.requestId}: ${params.decision}`
  );
  pendingCallbacks.delete(params.requestId);
  if (params.decision === "approved") {
    const permissionUpdates = parsePermissionUpdates(params.permissionUpdates);
    const updatedInput = params.updatedInput;
    callback.onAllow(updatedInput, permissionUpdates);
  } else {
    callback.onReject(params.feedback);
  }
  return true;
}
const pendingSandboxCallbacks = /* @__PURE__ */ new Map();
function registerSandboxPermissionCallback(callback) {
  pendingSandboxCallbacks.set(callback.requestId, callback);
  logForDebugging(
    `[SwarmPermissionPoller] Registered sandbox callback for request ${callback.requestId}`
  );
}
function hasSandboxPermissionCallback(requestId) {
  return pendingSandboxCallbacks.has(requestId);
}
function processSandboxPermissionResponse(params) {
  const callback = pendingSandboxCallbacks.get(params.requestId);
  if (!callback) {
    logForDebugging(
      `[SwarmPermissionPoller] No sandbox callback registered for request ${params.requestId}`
    );
    return false;
  }
  logForDebugging(
    `[SwarmPermissionPoller] Processing sandbox response for request ${params.requestId}: allow=${params.allow}`
  );
  pendingSandboxCallbacks.delete(params.requestId);
  callback.resolve(params.allow);
  return true;
}
function processResponse(response) {
  const callback = pendingCallbacks.get(response.requestId);
  if (!callback) {
    logForDebugging(
      `[SwarmPermissionPoller] No callback registered for request ${response.requestId}`
    );
    return false;
  }
  logForDebugging(
    `[SwarmPermissionPoller] Processing response for request ${response.requestId}: ${response.decision}`
  );
  pendingCallbacks.delete(response.requestId);
  if (response.decision === "approved") {
    const permissionUpdates = parsePermissionUpdates(response.permissionUpdates);
    const updatedInput = response.updatedInput;
    callback.onAllow(updatedInput, permissionUpdates);
  } else {
    callback.onReject(response.feedback);
  }
  return true;
}
function useSwarmPermissionPoller() {
  const isProcessingRef = useRef(false);
  const poll = useCallback(async () => {
    if (!isSwarmWorker()) {
      return;
    }
    if (isProcessingRef.current) {
      return;
    }
    if (pendingCallbacks.size === 0) {
      return;
    }
    isProcessingRef.current = true;
    try {
      const agentName = getAgentName();
      const teamName = getTeamName();
      if (!agentName || !teamName) {
        return;
      }
      for (const [requestId, _callback] of pendingCallbacks) {
        const response = await pollForResponse(requestId, agentName, teamName);
        if (response) {
          const processed = processResponse(response);
          if (processed) {
            await removeWorkerResponse(requestId, agentName, teamName);
          }
        }
      }
    } catch (error) {
      logForDebugging(
        `[SwarmPermissionPoller] Error during poll: ${errorMessage(error)}`
      );
    } finally {
      isProcessingRef.current = false;
    }
  }, []);
  const shouldPoll = isSwarmWorker();
  useInterval(() => void poll(), shouldPoll ? POLL_INTERVAL_MS : null);
  useEffect(() => {
    if (isSwarmWorker()) {
      void poll();
    }
  }, [poll]);
}
export {
  clearAllPendingCallbacks,
  hasPermissionCallback,
  hasSandboxPermissionCallback,
  processMailboxPermissionResponse,
  processSandboxPermissionResponse,
  registerPermissionCallback,
  registerSandboxPermissionCallback,
  unregisterPermissionCallback,
  useSwarmPermissionPoller
};
