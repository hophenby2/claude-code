import { randomUUID } from "crypto";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  createSyntheticAssistantMessage,
  createToolStub
} from "../remote/remotePermissionBridge.js";
import {
  convertSDKMessage,
  isSessionEndMessage
} from "../remote/sdkMessageAdapter.js";
import { findToolByName } from "../Tool.js";
import { logForDebugging } from "../utils/debug.js";
import { gracefulShutdown } from "../utils/gracefulShutdown.js";
function useSSHSession({
  session,
  setMessages,
  setIsLoading,
  setToolUseConfirmQueue,
  tools
}) {
  const isRemoteMode = !!session;
  const managerRef = useRef(null);
  const hasReceivedInitRef = useRef(false);
  const isConnectedRef = useRef(false);
  const toolsRef = useRef(tools);
  useEffect(() => {
    toolsRef.current = tools;
  }, [tools]);
  useEffect(() => {
    if (!session) return;
    hasReceivedInitRef.current = false;
    logForDebugging("[useSSHSession] wiring SSH session manager");
    const manager = session.createManager({
      onMessage: (sdkMessage) => {
        if (isSessionEndMessage(sdkMessage)) {
          setIsLoading(false);
        }
        if (sdkMessage.type === "system" && sdkMessage.subtype === "init") {
          if (hasReceivedInitRef.current) return;
          hasReceivedInitRef.current = true;
        }
        const converted = convertSDKMessage(sdkMessage, {
          convertToolResults: true
        });
        if (converted.type === "message") {
          setMessages((prev) => [...prev, converted.message]);
        }
      },
      onPermissionRequest: (request, requestId) => {
        logForDebugging(
          `[useSSHSession] permission request: ${request.tool_name}`
        );
        const tool = findToolByName(toolsRef.current, request.tool_name) ?? createToolStub(request.tool_name);
        const syntheticMessage = createSyntheticAssistantMessage(
          request,
          requestId
        );
        const permissionResult = {
          behavior: "ask",
          message: request.description ?? `${request.tool_name} requires permission`,
          suggestions: request.permission_suggestions,
          blockedPath: request.blocked_path
        };
        const toolUseConfirm = {
          assistantMessage: syntheticMessage,
          tool,
          description: request.description ?? `${request.tool_name} requires permission`,
          input: request.input,
          toolUseContext: {},
          toolUseID: request.tool_use_id,
          permissionResult,
          permissionPromptStartTimeMs: Date.now(),
          onUserInteraction() {
          },
          onAbort() {
            manager.respondToPermissionRequest(requestId, {
              behavior: "deny",
              message: "User aborted"
            });
            setToolUseConfirmQueue(
              (q) => q.filter((i) => i.toolUseID !== request.tool_use_id)
            );
          },
          onAllow(updatedInput) {
            manager.respondToPermissionRequest(requestId, {
              behavior: "allow",
              updatedInput
            });
            setToolUseConfirmQueue(
              (q) => q.filter((i) => i.toolUseID !== request.tool_use_id)
            );
            setIsLoading(true);
          },
          onReject(feedback) {
            manager.respondToPermissionRequest(requestId, {
              behavior: "deny",
              message: feedback ?? "User denied permission"
            });
            setToolUseConfirmQueue(
              (q) => q.filter((i) => i.toolUseID !== request.tool_use_id)
            );
          },
          async recheckPermission() {
          }
        };
        setToolUseConfirmQueue((q) => [...q, toolUseConfirm]);
        setIsLoading(false);
      },
      onConnected: () => {
        logForDebugging("[useSSHSession] connected");
        isConnectedRef.current = true;
      },
      onReconnecting: (attempt, max) => {
        logForDebugging(
          `[useSSHSession] ssh dropped, reconnecting (${attempt}/${max})`
        );
        isConnectedRef.current = false;
        setIsLoading(false);
        const msg = {
          type: "system",
          subtype: "informational",
          content: `SSH connection dropped \u2014 reconnecting (attempt ${attempt}/${max})...`,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          uuid: randomUUID(),
          level: "warning"
        };
        setMessages((prev) => [...prev, msg]);
      },
      onDisconnected: () => {
        logForDebugging("[useSSHSession] ssh process exited (giving up)");
        const stderr = session.getStderrTail().trim();
        const connected = isConnectedRef.current;
        const exitCode = session.proc.exitCode;
        isConnectedRef.current = false;
        setIsLoading(false);
        let msg = connected ? "Remote session ended." : "SSH session failed before connecting.";
        if (stderr && (!connected || exitCode !== 0)) {
          msg += `
Remote stderr (exit ${exitCode ?? "signal " + session.proc.signalCode}):
${stderr}`;
        }
        void gracefulShutdown(1, "other", { finalMessage: msg });
      },
      onError: (error) => {
        logForDebugging(`[useSSHSession] error: ${error.message}`);
      }
    });
    managerRef.current = manager;
    manager.connect();
    return () => {
      logForDebugging("[useSSHSession] cleanup");
      manager.disconnect();
      session.proxy.stop();
      managerRef.current = null;
    };
  }, [session, setMessages, setIsLoading, setToolUseConfirmQueue]);
  const sendMessage = useCallback(
    async (content) => {
      const m = managerRef.current;
      if (!m) return false;
      setIsLoading(true);
      return m.sendMessage(content);
    },
    [setIsLoading]
  );
  const cancelRequest = useCallback(() => {
    managerRef.current?.sendInterrupt();
    setIsLoading(false);
  }, [setIsLoading]);
  const disconnect = useCallback(() => {
    managerRef.current?.disconnect();
    managerRef.current = null;
    isConnectedRef.current = false;
  }, []);
  return useMemo(
    () => ({ isRemoteMode, sendMessage, cancelRequest, disconnect }),
    [isRemoteMode, sendMessage, cancelRequest, disconnect]
  );
}
export {
  useSSHSession
};
