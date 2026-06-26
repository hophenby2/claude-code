import { basename } from "path";
import { spawn } from "child_process";
import { pathExists } from "./file.js";
import { wrapSpawn } from "./ShellCommand.js";
import { TaskOutput } from "./task/TaskOutput.js";
import { getCwd } from "./cwd.js";
import { randomUUID } from "crypto";
import { formatShellPrefixCommand } from "./bash/shellPrefix.js";
import {
  getHookEnvFilePath,
  invalidateSessionEnvCache
} from "./sessionEnvironment.js";
import { subprocessEnv } from "./subprocessEnv.js";
import { getPlatform } from "./platform.js";
import { findGitBashPath, windowsPathToPosixPath } from "./windowsPaths.js";
import { getCachedPowerShellPath } from "./shell/powershellDetection.js";
import { DEFAULT_HOOK_SHELL } from "./shell/shellProvider.js";
import { buildPowerShellArgs } from "./shell/powershellProvider.js";
import {
  loadPluginOptions,
  substituteUserConfigVariables
} from "./plugins/pluginOptionsStorage.js";
import { getPluginDataDir } from "./plugins/pluginDirectories.js";
import {
  getSessionId,
  getProjectRoot,
  getIsNonInteractiveSession,
  getRegisteredHooks,
  getStatsStore,
  addToTurnHookDuration,
  getOriginalCwd,
  getMainThreadAgentType
} from "../bootstrap/state.js";
import { checkHasTrustDialogAccepted } from "./config.js";
import {
  getHooksConfigFromSnapshot,
  shouldAllowManagedHooksOnly,
  shouldDisableAllHooksIncludingManaged
} from "./hooks/hooksConfigSnapshot.js";
import {
  getTranscriptPathForSession,
  getAgentTranscriptPath
} from "./sessionStorage.js";
import {
  getSettings_DEPRECATED,
  getSettingsForSource
} from "./settings/settings.js";
import {
  logEvent
} from "../services/analytics/index.js";
import { logOTelEvent } from "./telemetry/events.js";
import { ALLOWED_OFFICIAL_MARKETPLACE_NAMES } from "./plugins/schemas.js";
import {
  startHookSpan,
  endHookSpan,
  isBetaTracingEnabled
} from "./telemetry/sessionTracing.js";
import {
  hookJSONOutputSchema,
  promptRequestSchema,
  isAsyncHookJSONOutput,
  isSyncHookJSONOutput
} from "../types/hooks.js";
import chalk from "chalk";
import { getHookDisplayText } from "./hooks/hooksSettings.js";
import { logForDebugging } from "./debug.js";
import { logForDiagnosticsNoPII } from "./diagLogs.js";
import { firstLineOf } from "./stringUtils.js";
import {
  normalizeLegacyToolName,
  getLegacyToolNames,
  permissionRuleValueFromString
} from "./permissions/permissionRuleParser.js";
import { logError } from "./log.js";
import { createCombinedAbortSignal } from "./combinedAbortSignal.js";
import { registerPendingAsyncHook } from "./hooks/AsyncHookRegistry.js";
import { enqueuePendingNotification } from "./messageQueueManager.js";
import {
  extractTextContent,
  getLastAssistantMessage,
  wrapInSystemReminder
} from "./messages.js";
import {
  emitHookStarted,
  emitHookResponse,
  startHookProgressInterval
} from "./hooks/hookEvents.js";
import { createAttachmentMessage } from "./attachments.js";
import { all } from "./generators.js";
import { findToolByName } from "../Tool.js";
import { execPromptHook } from "./hooks/execPromptHook.js";
import { execAgentHook } from "./hooks/execAgentHook.js";
import { execHttpHook } from "./hooks/execHttpHook.js";
import {
  getSessionHooks,
  getSessionFunctionHooks,
  getSessionHookCallback,
  clearSessionHooks
} from "./hooks/sessionHooks.js";
import { jsonStringify, jsonParse } from "./slowOperations.js";
import { isEnvTruthy } from "./envUtils.js";
import { errorMessage, getErrnoCode } from "./errors.js";
const TOOL_HOOK_EXECUTION_TIMEOUT_MS = 10 * 60 * 1e3;
const SESSION_END_HOOK_TIMEOUT_MS_DEFAULT = 1500;
function getSessionEndHookTimeoutMs() {
  const raw = process.env.CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : SESSION_END_HOOK_TIMEOUT_MS_DEFAULT;
}
function executeInBackground({
  processId,
  hookId,
  shellCommand,
  asyncResponse,
  hookEvent,
  hookName,
  command,
  asyncRewake,
  pluginId
}) {
  if (asyncRewake) {
    void shellCommand.result.then(async (result) => {
      await new Promise((resolve) => setImmediate(resolve));
      const stdout = await shellCommand.taskOutput.getStdout();
      const stderr = shellCommand.taskOutput.getStderr();
      shellCommand.cleanup();
      emitHookResponse({
        hookId,
        hookName,
        hookEvent,
        output: stdout + stderr,
        stdout,
        stderr,
        exitCode: result.code,
        outcome: result.code === 0 ? "success" : "error"
      });
      if (result.code === 2) {
        enqueuePendingNotification({
          value: wrapInSystemReminder(
            `Stop hook blocking error from command "${hookName}": ${stderr || stdout}`
          ),
          mode: "task-notification"
        });
      }
    });
    return true;
  }
  if (!shellCommand.background(processId)) {
    return false;
  }
  registerPendingAsyncHook({
    processId,
    hookId,
    asyncResponse,
    hookEvent,
    hookName,
    command,
    shellCommand,
    pluginId
  });
  return true;
}
function shouldSkipHookDueToTrust() {
  const isInteractive = !getIsNonInteractiveSession();
  if (!isInteractive) {
    return false;
  }
  const hasTrust = checkHasTrustDialogAccepted();
  return !hasTrust;
}
function createBaseHookInput(permissionMode, sessionId, agentInfo) {
  const resolvedSessionId = sessionId ?? getSessionId();
  const resolvedAgentType = agentInfo?.agentType ?? getMainThreadAgentType();
  return {
    session_id: resolvedSessionId,
    transcript_path: getTranscriptPathForSession(resolvedSessionId),
    cwd: getCwd(),
    permission_mode: permissionMode,
    agent_id: agentInfo?.agentId,
    agent_type: resolvedAgentType
  };
}
function validateHookJson(jsonString) {
  const parsed = jsonParse(jsonString);
  const validation = hookJSONOutputSchema().safeParse(parsed);
  if (validation.success) {
    logForDebugging("Successfully parsed and validated hook JSON output");
    return { json: validation.data };
  }
  const errors = validation.error.issues.map((err) => `  - ${err.path.join(".")}: ${err.message}`).join("\n");
  return {
    validationError: `Hook JSON output validation failed:
${errors}

The hook's output was: ${jsonStringify(parsed, null, 2)}`
  };
}
function parseHookOutput(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith("{")) {
    logForDebugging("Hook output does not start with {, treating as plain text");
    return { plainText: stdout };
  }
  try {
    const result = validateHookJson(trimmed);
    if ("json" in result) {
      return result;
    }
    const errorMessage2 = `${result.validationError}

Expected schema:
${jsonStringify(
      {
        continue: "boolean (optional)",
        suppressOutput: "boolean (optional)",
        stopReason: "string (optional)",
        decision: '"approve" | "block" (optional)',
        reason: "string (optional)",
        systemMessage: "string (optional)",
        permissionDecision: '"allow" | "deny" | "ask" (optional)',
        hookSpecificOutput: {
          "for PreToolUse": {
            hookEventName: '"PreToolUse"',
            permissionDecision: '"allow" | "deny" | "ask" (optional)',
            permissionDecisionReason: "string (optional)",
            updatedInput: "object (optional) - Modified tool input to use"
          },
          "for UserPromptSubmit": {
            hookEventName: '"UserPromptSubmit"',
            additionalContext: "string (required)"
          },
          "for PostToolUse": {
            hookEventName: '"PostToolUse"',
            additionalContext: "string (optional)"
          }
        }
      },
      null,
      2
    )}`;
    logForDebugging(errorMessage2);
    return { plainText: stdout, validationError: errorMessage2 };
  } catch (e) {
    logForDebugging(`Failed to parse hook output as JSON: ${e}`);
    return { plainText: stdout };
  }
}
function parseHttpHookOutput(body) {
  const trimmed = body.trim();
  if (trimmed === "") {
    const validation = hookJSONOutputSchema().safeParse({});
    if (validation.success) {
      logForDebugging(
        "HTTP hook returned empty body, treating as empty JSON object"
      );
      return { json: validation.data };
    }
  }
  if (!trimmed.startsWith("{")) {
    const validationError = `HTTP hook must return JSON, but got non-JSON response body: ${trimmed.length > 200 ? trimmed.slice(0, 200) + "\u2026" : trimmed}`;
    logForDebugging(validationError);
    return { validationError };
  }
  try {
    const result = validateHookJson(trimmed);
    if ("json" in result) {
      return result;
    }
    logForDebugging(result.validationError);
    return result;
  } catch (e) {
    const validationError = `HTTP hook must return valid JSON, but parsing failed: ${e}`;
    logForDebugging(validationError);
    return { validationError };
  }
}
function processHookJSONOutput({
  json,
  command,
  hookName,
  toolUseID,
  hookEvent,
  expectedHookEvent,
  stdout,
  stderr,
  exitCode,
  durationMs
}) {
  const result = {};
  const syncJson = json;
  if (syncJson.continue === false) {
    result.preventContinuation = true;
    if (syncJson.stopReason) {
      result.stopReason = syncJson.stopReason;
    }
  }
  if (json.decision) {
    switch (json.decision) {
      case "approve":
        result.permissionBehavior = "allow";
        break;
      case "block":
        result.permissionBehavior = "deny";
        result.blockingError = {
          blockingError: json.reason || "Blocked by hook",
          command
        };
        break;
      default:
        throw new Error(
          `Unknown hook decision type: ${json.decision}. Valid types are: approve, block`
        );
    }
  }
  if (json.systemMessage) {
    result.systemMessage = json.systemMessage;
  }
  if (json.hookSpecificOutput?.hookEventName === "PreToolUse" && json.hookSpecificOutput.permissionDecision) {
    switch (json.hookSpecificOutput.permissionDecision) {
      case "allow":
        result.permissionBehavior = "allow";
        break;
      case "deny":
        result.permissionBehavior = "deny";
        result.blockingError = {
          blockingError: json.reason || "Blocked by hook",
          command
        };
        break;
      case "ask":
        result.permissionBehavior = "ask";
        break;
      default:
        throw new Error(
          `Unknown hook permissionDecision type: ${json.hookSpecificOutput.permissionDecision}. Valid types are: allow, deny, ask`
        );
    }
  }
  if (result.permissionBehavior !== void 0 && json.reason !== void 0) {
    result.hookPermissionDecisionReason = json.reason;
  }
  if (json.hookSpecificOutput) {
    if (expectedHookEvent && json.hookSpecificOutput.hookEventName !== expectedHookEvent) {
      throw new Error(
        `Hook returned incorrect event name: expected '${expectedHookEvent}' but got '${json.hookSpecificOutput.hookEventName}'. Full stdout: ${jsonStringify(json, null, 2)}`
      );
    }
    switch (json.hookSpecificOutput.hookEventName) {
      case "PreToolUse":
        if (json.hookSpecificOutput.permissionDecision) {
          switch (json.hookSpecificOutput.permissionDecision) {
            case "allow":
              result.permissionBehavior = "allow";
              break;
            case "deny":
              result.permissionBehavior = "deny";
              result.blockingError = {
                blockingError: json.hookSpecificOutput.permissionDecisionReason || json.reason || "Blocked by hook",
                command
              };
              break;
            case "ask":
              result.permissionBehavior = "ask";
              break;
          }
        }
        result.hookPermissionDecisionReason = json.hookSpecificOutput.permissionDecisionReason;
        if (json.hookSpecificOutput.updatedInput) {
          result.updatedInput = json.hookSpecificOutput.updatedInput;
        }
        result.additionalContext = json.hookSpecificOutput.additionalContext;
        break;
      case "UserPromptSubmit":
        result.additionalContext = json.hookSpecificOutput.additionalContext;
        break;
      case "SessionStart":
        result.additionalContext = json.hookSpecificOutput.additionalContext;
        result.initialUserMessage = json.hookSpecificOutput.initialUserMessage;
        if ("watchPaths" in json.hookSpecificOutput && json.hookSpecificOutput.watchPaths) {
          result.watchPaths = json.hookSpecificOutput.watchPaths;
        }
        break;
      case "Setup":
        result.additionalContext = json.hookSpecificOutput.additionalContext;
        break;
      case "SubagentStart":
        result.additionalContext = json.hookSpecificOutput.additionalContext;
        break;
      case "PostToolUse":
        result.additionalContext = json.hookSpecificOutput.additionalContext;
        if (json.hookSpecificOutput.updatedMCPToolOutput) {
          result.updatedMCPToolOutput = json.hookSpecificOutput.updatedMCPToolOutput;
        }
        break;
      case "PostToolUseFailure":
        result.additionalContext = json.hookSpecificOutput.additionalContext;
        break;
      case "PermissionDenied":
        result.retry = json.hookSpecificOutput.retry;
        break;
      case "PermissionRequest":
        if (json.hookSpecificOutput.decision) {
          result.permissionRequestResult = json.hookSpecificOutput.decision;
          result.permissionBehavior = json.hookSpecificOutput.decision.behavior === "allow" ? "allow" : "deny";
          if (json.hookSpecificOutput.decision.behavior === "allow" && json.hookSpecificOutput.decision.updatedInput) {
            result.updatedInput = json.hookSpecificOutput.decision.updatedInput;
          }
        }
        break;
      case "Elicitation":
        if (json.hookSpecificOutput.action) {
          result.elicitationResponse = {
            action: json.hookSpecificOutput.action,
            content: json.hookSpecificOutput.content
          };
          if (json.hookSpecificOutput.action === "decline") {
            result.blockingError = {
              blockingError: json.reason || "Elicitation denied by hook",
              command
            };
          }
        }
        break;
      case "ElicitationResult":
        if (json.hookSpecificOutput.action) {
          result.elicitationResultResponse = {
            action: json.hookSpecificOutput.action,
            content: json.hookSpecificOutput.content
          };
          if (json.hookSpecificOutput.action === "decline") {
            result.blockingError = {
              blockingError: json.reason || "Elicitation result blocked by hook",
              command
            };
          }
        }
        break;
    }
  }
  return {
    ...result,
    message: result.blockingError ? createAttachmentMessage({
      type: "hook_blocking_error",
      hookName,
      toolUseID,
      hookEvent,
      blockingError: result.blockingError
    }) : createAttachmentMessage({
      type: "hook_success",
      hookName,
      toolUseID,
      hookEvent,
      // JSON-output hooks inject context via additionalContext →
      // hook_additional_context, not this field. Empty content suppresses
      // the trivial "X hook success: Success" system-reminder that
      // otherwise pollutes every turn (messages.ts:3577 skips on '').
      content: "",
      stdout,
      stderr,
      exitCode,
      command,
      durationMs
    })
  };
}
async function execCommandHook(hook, hookEvent, hookName, jsonInput, signal, hookId, hookIndex, pluginRoot, pluginId, skillRoot, forceSyncExecution, requestPrompt) {
  const shouldEmitDiag = hookEvent === "SessionStart" || hookEvent === "Setup" || hookEvent === "SessionEnd";
  const diagStartMs = Date.now();
  let diagExitCode;
  let diagAborted = false;
  const isWindows = getPlatform() === "windows";
  const shellType = hook.shell ?? DEFAULT_HOOK_SHELL;
  const isPowerShell = shellType === "powershell";
  const toHookPath = isWindows && !isPowerShell ? (p) => windowsPathToPosixPath(p) : (p) => p;
  const projectDir = getProjectRoot();
  let command = hook.command;
  let pluginOpts;
  if (pluginRoot) {
    if (!await pathExists(pluginRoot)) {
      throw new Error(
        `Plugin directory does not exist: ${pluginRoot}` + (pluginId ? ` (${pluginId} \u2014 run /plugin to reinstall)` : "")
      );
    }
    const rootPath = toHookPath(pluginRoot);
    command = command.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, () => rootPath);
    if (pluginId) {
      const dataPath = toHookPath(getPluginDataDir(pluginId));
      command = command.replace(/\$\{CLAUDE_PLUGIN_DATA\}/g, () => dataPath);
    }
    if (pluginId) {
      pluginOpts = loadPluginOptions(pluginId);
      command = substituteUserConfigVariables(command, pluginOpts);
    }
  }
  if (isWindows && !isPowerShell && command.trim().match(/\.sh(\s|$|")/)) {
    if (!command.trim().startsWith("bash ")) {
      command = `bash ${command}`;
    }
  }
  const finalCommand = !isPowerShell && process.env.CLAUDE_CODE_SHELL_PREFIX ? formatShellPrefixCommand(process.env.CLAUDE_CODE_SHELL_PREFIX, command) : command;
  const hookTimeoutMs = hook.timeout ? hook.timeout * 1e3 : TOOL_HOOK_EXECUTION_TIMEOUT_MS;
  const envVars = {
    ...subprocessEnv(),
    CLAUDE_PROJECT_DIR: toHookPath(projectDir)
  };
  if (pluginRoot) {
    envVars.CLAUDE_PLUGIN_ROOT = toHookPath(pluginRoot);
    if (pluginId) {
      envVars.CLAUDE_PLUGIN_DATA = toHookPath(getPluginDataDir(pluginId));
    }
  }
  if (pluginOpts) {
    for (const [key, value] of Object.entries(pluginOpts)) {
      const envKey = key.replace(/[^A-Za-z0-9_]/g, "_").toUpperCase();
      envVars[`CLAUDE_PLUGIN_OPTION_${envKey}`] = String(value);
    }
  }
  if (skillRoot) {
    envVars.CLAUDE_PLUGIN_ROOT = toHookPath(skillRoot);
  }
  if (!isPowerShell && (hookEvent === "SessionStart" || hookEvent === "Setup" || hookEvent === "CwdChanged" || hookEvent === "FileChanged") && hookIndex !== void 0) {
    envVars.CLAUDE_ENV_FILE = await getHookEnvFilePath(hookEvent, hookIndex);
  }
  const hookCwd = getCwd();
  const safeCwd = await pathExists(hookCwd) ? hookCwd : getOriginalCwd();
  if (safeCwd !== hookCwd) {
    logForDebugging(
      `Hooks: cwd ${hookCwd} not found, falling back to original cwd`,
      { level: "warn" }
    );
  }
  let child;
  if (shellType === "powershell") {
    const pwshPath = await getCachedPowerShellPath();
    if (!pwshPath) {
      throw new Error(
        `Hook "${hook.command}" has shell: 'powershell' but no PowerShell executable (pwsh or powershell) was found on PATH. Install PowerShell, or remove "shell": "powershell" to use bash.`
      );
    }
    child = spawn(pwshPath, buildPowerShellArgs(finalCommand), {
      env: envVars,
      cwd: safeCwd,
      // Prevent visible console window on Windows (no-op on other platforms)
      windowsHide: true
    });
  } else {
    const shell = isWindows ? findGitBashPath() : true;
    child = spawn(finalCommand, [], {
      env: envVars,
      cwd: safeCwd,
      shell,
      // Prevent visible console window on Windows (no-op on other platforms)
      windowsHide: true
    });
  }
  const hookTaskOutput = new TaskOutput(`hook_${child.pid}`, null);
  const shellCommand = wrapSpawn(child, signal, hookTimeoutMs, hookTaskOutput);
  let shellCommandTransferred = false;
  let stdinWritten = false;
  if ((hook.async || hook.asyncRewake) && !forceSyncExecution) {
    const processId = `async_hook_${child.pid}`;
    logForDebugging(
      `Hooks: Config-based async hook, backgrounding process ${processId}`
    );
    child.stdin.write(jsonInput + "\n", "utf8");
    child.stdin.end();
    stdinWritten = true;
    const backgrounded = executeInBackground({
      processId,
      hookId,
      shellCommand,
      asyncResponse: { async: true, asyncTimeout: hookTimeoutMs },
      hookEvent,
      hookName,
      command: hook.command,
      asyncRewake: hook.asyncRewake,
      pluginId
    });
    if (backgrounded) {
      return {
        stdout: "",
        stderr: "",
        output: "",
        status: 0,
        backgrounded: true
      };
    }
  }
  let stdout = "";
  let stderr = "";
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let initialResponseChecked = false;
  let asyncResolve = null;
  const childIsAsyncPromise = new Promise((resolve) => {
    asyncResolve = resolve;
  });
  const processedPromptLines = /* @__PURE__ */ new Set();
  let promptChain = Promise.resolve();
  let lineBuffer = "";
  child.stdout.on("data", (data) => {
    stdout += data;
    output += data;
    if (requestPrompt) {
      lineBuffer += data;
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = jsonParse(trimmed);
          const validation = promptRequestSchema().safeParse(parsed);
          if (validation.success) {
            processedPromptLines.add(trimmed);
            logForDebugging(
              `Hooks: Detected prompt request from hook: ${trimmed}`
            );
            const promptReq = validation.data;
            const reqPrompt = requestPrompt;
            promptChain = promptChain.then(async () => {
              try {
                const response = await reqPrompt(promptReq);
                child.stdin.write(jsonStringify(response) + "\n", "utf8");
              } catch (err) {
                logForDebugging(`Hooks: Prompt request handling failed: ${err}`);
                child.stdin.destroy();
              }
            });
            continue;
          }
        } catch {
        }
      }
    }
    if (!initialResponseChecked) {
      const firstLine = firstLineOf(stdout).trim();
      if (!firstLine.includes("}")) return;
      initialResponseChecked = true;
      logForDebugging(`Hooks: Checking first line for async: ${firstLine}`);
      try {
        const parsed = jsonParse(firstLine);
        logForDebugging(
          `Hooks: Parsed initial response: ${jsonStringify(parsed)}`
        );
        if (isAsyncHookJSONOutput(parsed) && !forceSyncExecution) {
          const processId = `async_hook_${child.pid}`;
          logForDebugging(
            `Hooks: Detected async hook, backgrounding process ${processId}`
          );
          const backgrounded = executeInBackground({
            processId,
            hookId,
            shellCommand,
            asyncResponse: parsed,
            hookEvent,
            hookName,
            command: hook.command,
            pluginId
          });
          if (backgrounded) {
            shellCommandTransferred = true;
            asyncResolve?.({
              stdout,
              stderr,
              output,
              status: 0
            });
          }
        } else if (isAsyncHookJSONOutput(parsed) && forceSyncExecution) {
          logForDebugging(
            `Hooks: Detected async hook but forceSyncExecution is true, waiting for completion`
          );
        } else {
          logForDebugging(
            `Hooks: Initial response is not async, continuing normal processing`
          );
        }
      } catch (e) {
        logForDebugging(`Hooks: Failed to parse initial response as JSON: ${e}`);
      }
    }
  });
  child.stderr.on("data", (data) => {
    stderr += data;
    output += data;
  });
  const stopProgressInterval = startHookProgressInterval({
    hookId,
    hookName,
    hookEvent,
    getOutput: async () => ({ stdout, stderr, output })
  });
  const stdoutEndPromise = new Promise((resolve) => {
    child.stdout.on("end", () => resolve());
  });
  const stderrEndPromise = new Promise((resolve) => {
    child.stderr.on("end", () => resolve());
  });
  const stdinWritePromise = stdinWritten ? Promise.resolve() : new Promise((resolve, reject) => {
    child.stdin.on("error", (err) => {
      if (!requestPrompt) {
        reject(err);
      } else {
        logForDebugging(
          `Hooks: stdin error during prompt flow (likely process exited): ${err}`
        );
      }
    });
    child.stdin.write(jsonInput + "\n", "utf8");
    if (!requestPrompt) {
      child.stdin.end();
    }
    resolve();
  });
  const childErrorPromise = new Promise((_, reject) => {
    child.on("error", reject);
  });
  const childClosePromise = new Promise((resolve) => {
    let exitCode = null;
    child.on("close", (code) => {
      exitCode = code ?? 1;
      void Promise.all([stdoutEndPromise, stderrEndPromise]).then(() => {
        const finalStdout = processedPromptLines.size === 0 ? stdout : stdout.split("\n").filter((line) => !processedPromptLines.has(line.trim())).join("\n");
        resolve({
          stdout: finalStdout,
          stderr,
          output,
          status: exitCode,
          aborted: signal.aborted
        });
      });
    });
  });
  try {
    if (shouldEmitDiag) {
      logForDiagnosticsNoPII("info", "hook_spawn_started", {
        hook_event_name: hookEvent,
        index: hookIndex
      });
    }
    await Promise.race([stdinWritePromise, childErrorPromise]);
    const result = await Promise.race([
      childIsAsyncPromise,
      childClosePromise,
      childErrorPromise
    ]);
    await promptChain;
    diagExitCode = result.status;
    diagAborted = result.aborted ?? false;
    return result;
  } catch (error) {
    const code = getErrnoCode(error);
    diagExitCode = 1;
    if (code === "EPIPE") {
      logForDebugging(
        "EPIPE error while writing to hook stdin (hook command likely closed early)"
      );
      const errMsg = "Hook command closed stdin before hook input was fully written (EPIPE)";
      return {
        stdout: "",
        stderr: errMsg,
        output: errMsg,
        status: 1
      };
    } else if (code === "ABORT_ERR") {
      diagAborted = true;
      return {
        stdout: "",
        stderr: "Hook cancelled",
        output: "Hook cancelled",
        status: 1,
        aborted: true
      };
    } else {
      const errorMsg = errorMessage(error);
      const errOutput = `Error occurred while executing hook command: ${errorMsg}`;
      return {
        stdout: "",
        stderr: errOutput,
        output: errOutput,
        status: 1
      };
    }
  } finally {
    if (shouldEmitDiag) {
      logForDiagnosticsNoPII("info", "hook_spawn_completed", {
        hook_event_name: hookEvent,
        index: hookIndex,
        duration_ms: Date.now() - diagStartMs,
        exit_code: diagExitCode,
        aborted: diagAborted
      });
    }
    stopProgressInterval();
    if (!shellCommandTransferred) {
      shellCommand.cleanup();
    }
  }
}
function matchesPattern(matchQuery, matcher) {
  if (!matcher || matcher === "*") {
    return true;
  }
  if (/^[a-zA-Z0-9_|]+$/.test(matcher)) {
    if (matcher.includes("|")) {
      const patterns = matcher.split("|").map((p) => normalizeLegacyToolName(p.trim()));
      return patterns.includes(matchQuery);
    }
    return matchQuery === normalizeLegacyToolName(matcher);
  }
  try {
    const regex = new RegExp(matcher);
    if (regex.test(matchQuery)) {
      return true;
    }
    for (const legacyName of getLegacyToolNames(matchQuery)) {
      if (regex.test(legacyName)) {
        return true;
      }
    }
    return false;
  } catch {
    logForDebugging(`Invalid regex pattern in hook matcher: ${matcher}`);
    return false;
  }
}
async function prepareIfConditionMatcher(hookInput, tools) {
  if (hookInput.hook_event_name !== "PreToolUse" && hookInput.hook_event_name !== "PostToolUse" && hookInput.hook_event_name !== "PostToolUseFailure" && hookInput.hook_event_name !== "PermissionRequest") {
    return void 0;
  }
  const toolName = normalizeLegacyToolName(hookInput.tool_name);
  const tool = tools && findToolByName(tools, hookInput.tool_name);
  const input = tool?.inputSchema.safeParse(hookInput.tool_input);
  const patternMatcher = input?.success && tool?.preparePermissionMatcher ? await tool.preparePermissionMatcher(input.data) : void 0;
  return (ifCondition) => {
    const parsed = permissionRuleValueFromString(ifCondition);
    if (normalizeLegacyToolName(parsed.toolName) !== toolName) {
      return false;
    }
    if (!parsed.ruleContent) {
      return true;
    }
    return patternMatcher ? patternMatcher(parsed.ruleContent) : false;
  };
}
function isInternalHook(matched) {
  return matched.hook.type === "callback" && matched.hook.internal === true;
}
function hookDedupKey(m, payload) {
  return `${m.pluginRoot ?? m.skillRoot ?? ""}\0${payload}`;
}
function getPluginHookCounts(hooks) {
  const pluginHooks = hooks.filter((h) => h.pluginId);
  if (pluginHooks.length === 0) {
    return void 0;
  }
  const counts = {};
  for (const h of pluginHooks) {
    const atIndex = h.pluginId.lastIndexOf("@");
    const isOfficial = atIndex > 0 && ALLOWED_OFFICIAL_MARKETPLACE_NAMES.has(h.pluginId.slice(atIndex + 1));
    const key = isOfficial ? h.pluginId : "third-party";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}
function getHookTypeCounts(hooks) {
  const counts = {};
  for (const h of hooks) {
    counts[h.hook.type] = (counts[h.hook.type] || 0) + 1;
  }
  return counts;
}
function getHooksConfig(appState, sessionId, hookEvent) {
  const hooks = [...getHooksConfigFromSnapshot()?.[hookEvent] ?? []];
  const managedOnly = shouldAllowManagedHooksOnly();
  const registeredHooks = getRegisteredHooks()?.[hookEvent];
  if (registeredHooks) {
    for (const matcher of registeredHooks) {
      if (managedOnly && "pluginRoot" in matcher) {
        continue;
      }
      hooks.push(matcher);
    }
  }
  if (!managedOnly && appState !== void 0) {
    const sessionHooks = getSessionHooks(appState, sessionId, hookEvent).get(
      hookEvent
    );
    if (sessionHooks) {
      for (const matcher of sessionHooks) {
        hooks.push(matcher);
      }
    }
    const sessionFunctionHooks = getSessionFunctionHooks(
      appState,
      sessionId,
      hookEvent
    ).get(hookEvent);
    if (sessionFunctionHooks) {
      for (const matcher of sessionFunctionHooks) {
        hooks.push(matcher);
      }
    }
  }
  return hooks;
}
function hasHookForEvent(hookEvent, appState, sessionId) {
  const snap = getHooksConfigFromSnapshot()?.[hookEvent];
  if (snap && snap.length > 0) return true;
  const reg = getRegisteredHooks()?.[hookEvent];
  if (reg && reg.length > 0) return true;
  if (appState?.sessionHooks.get(sessionId)?.hooks[hookEvent]) return true;
  return false;
}
async function getMatchingHooks(appState, sessionId, hookEvent, hookInput, tools) {
  try {
    const hookMatchers = getHooksConfig(appState, sessionId, hookEvent);
    let matchQuery = void 0;
    switch (hookInput.hook_event_name) {
      case "PreToolUse":
      case "PostToolUse":
      case "PostToolUseFailure":
      case "PermissionRequest":
      case "PermissionDenied":
        matchQuery = hookInput.tool_name;
        break;
      case "SessionStart":
        matchQuery = hookInput.source;
        break;
      case "Setup":
        matchQuery = hookInput.trigger;
        break;
      case "PreCompact":
      case "PostCompact":
        matchQuery = hookInput.trigger;
        break;
      case "Notification":
        matchQuery = hookInput.notification_type;
        break;
      case "SessionEnd":
        matchQuery = hookInput.reason;
        break;
      case "StopFailure":
        matchQuery = hookInput.error;
        break;
      case "SubagentStart":
        matchQuery = hookInput.agent_type;
        break;
      case "SubagentStop":
        matchQuery = hookInput.agent_type;
        break;
      case "TeammateIdle":
      case "TaskCreated":
      case "TaskCompleted":
        break;
      case "Elicitation":
        matchQuery = hookInput.mcp_server_name;
        break;
      case "ElicitationResult":
        matchQuery = hookInput.mcp_server_name;
        break;
      case "ConfigChange":
        matchQuery = hookInput.source;
        break;
      case "InstructionsLoaded":
        matchQuery = hookInput.load_reason;
        break;
      case "FileChanged":
        matchQuery = basename(hookInput.file_path);
        break;
      default:
        break;
    }
    logForDebugging(
      `Getting matching hook commands for ${hookEvent} with query: ${matchQuery}`,
      { level: "verbose" }
    );
    logForDebugging(`Found ${hookMatchers.length} hook matchers in settings`, {
      level: "verbose"
    });
    const filteredMatchers = matchQuery ? hookMatchers.filter(
      (matcher) => !matcher.matcher || matchesPattern(matchQuery, matcher.matcher)
    ) : hookMatchers;
    const matchedHooks = filteredMatchers.flatMap((matcher) => {
      const pluginRoot = "pluginRoot" in matcher ? matcher.pluginRoot : void 0;
      const pluginId = "pluginId" in matcher ? matcher.pluginId : void 0;
      const skillRoot = "skillRoot" in matcher ? matcher.skillRoot : void 0;
      const hookSource = pluginRoot ? "pluginName" in matcher ? `plugin:${matcher.pluginName}` : "plugin" : skillRoot ? "skillName" in matcher ? `skill:${matcher.skillName}` : "skill" : "settings";
      return matcher.hooks.map((hook) => ({
        hook,
        pluginRoot,
        pluginId,
        skillRoot,
        hookSource
      }));
    });
    if (matchedHooks.every(
      (m) => m.hook.type === "callback" || m.hook.type === "function"
    )) {
      return matchedHooks;
    }
    const getIfCondition = (hook) => hook.if ?? "";
    const uniqueCommandHooks = Array.from(
      new Map(
        matchedHooks.filter(
          (m) => m.hook.type === "command"
        ).map((m) => [
          hookDedupKey(
            m,
            `${m.hook.shell ?? DEFAULT_HOOK_SHELL}\0${m.hook.command}\0${getIfCondition(m.hook)}`
          ),
          m
        ])
      ).values()
    );
    const uniquePromptHooks = Array.from(
      new Map(
        matchedHooks.filter((m) => m.hook.type === "prompt").map((m) => [
          hookDedupKey(
            m,
            `${m.hook.prompt}\0${getIfCondition(m.hook)}`
          ),
          m
        ])
      ).values()
    );
    const uniqueAgentHooks = Array.from(
      new Map(
        matchedHooks.filter((m) => m.hook.type === "agent").map((m) => [
          hookDedupKey(
            m,
            `${m.hook.prompt}\0${getIfCondition(m.hook)}`
          ),
          m
        ])
      ).values()
    );
    const uniqueHttpHooks = Array.from(
      new Map(
        matchedHooks.filter((m) => m.hook.type === "http").map((m) => [
          hookDedupKey(
            m,
            `${m.hook.url}\0${getIfCondition(m.hook)}`
          ),
          m
        ])
      ).values()
    );
    const callbackHooks = matchedHooks.filter((m) => m.hook.type === "callback");
    const functionHooks = matchedHooks.filter((m) => m.hook.type === "function");
    const uniqueHooks = [
      ...uniqueCommandHooks,
      ...uniquePromptHooks,
      ...uniqueAgentHooks,
      ...uniqueHttpHooks,
      ...callbackHooks,
      ...functionHooks
    ];
    const hasIfCondition = uniqueHooks.some(
      (h) => (h.hook.type === "command" || h.hook.type === "prompt" || h.hook.type === "agent" || h.hook.type === "http") && h.hook.if
    );
    const ifMatcher = hasIfCondition ? await prepareIfConditionMatcher(hookInput, tools) : void 0;
    const ifFilteredHooks = uniqueHooks.filter((h) => {
      if (h.hook.type !== "command" && h.hook.type !== "prompt" && h.hook.type !== "agent" && h.hook.type !== "http") {
        return true;
      }
      const ifCondition = h.hook.if;
      if (!ifCondition) {
        return true;
      }
      if (!ifMatcher) {
        logForDebugging(
          `Hook if condition "${ifCondition}" cannot be evaluated for non-tool event ${hookInput.hook_event_name}`
        );
        return false;
      }
      if (ifMatcher(ifCondition)) {
        return true;
      }
      logForDebugging(
        `Skipping hook due to if condition "${ifCondition}" not matching`
      );
      return false;
    });
    const filteredHooks = hookEvent === "SessionStart" || hookEvent === "Setup" ? ifFilteredHooks.filter((h) => {
      if (h.hook.type === "http") {
        logForDebugging(
          `Skipping HTTP hook ${h.hook.url} \u2014 HTTP hooks are not supported for ${hookEvent}`
        );
        return false;
      }
      return true;
    }) : ifFilteredHooks;
    logForDebugging(
      `Matched ${filteredHooks.length} unique hooks for query "${matchQuery || "no match query"}" (${matchedHooks.length} before deduplication)`,
      { level: "verbose" }
    );
    return filteredHooks;
  } catch {
    return [];
  }
}
function getPreToolHookBlockingMessage(hookName, blockingError) {
  return `${hookName} hook error: ${blockingError.blockingError}`;
}
function getStopHookMessage(blockingError) {
  return `Stop hook feedback:
${blockingError.blockingError}`;
}
function getTeammateIdleHookMessage(blockingError) {
  return `TeammateIdle hook feedback:
${blockingError.blockingError}`;
}
function getTaskCreatedHookMessage(blockingError) {
  return `TaskCreated hook feedback:
${blockingError.blockingError}`;
}
function getTaskCompletedHookMessage(blockingError) {
  return `TaskCompleted hook feedback:
${blockingError.blockingError}`;
}
function getUserPromptSubmitHookBlockingMessage(blockingError) {
  return `UserPromptSubmit operation blocked by hook:
${blockingError.blockingError}`;
}
async function* executeHooks({
  hookInput,
  toolUseID,
  matchQuery,
  signal,
  timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
  toolUseContext,
  messages,
  forceSyncExecution,
  requestPrompt,
  toolInputSummary
}) {
  if (shouldDisableAllHooksIncludingManaged()) {
    return;
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)) {
    return;
  }
  const hookEvent = hookInput.hook_event_name;
  const hookName = matchQuery ? `${hookEvent}:${matchQuery}` : hookEvent;
  const boundRequestPrompt = requestPrompt?.(hookName, toolInputSummary);
  if (shouldSkipHookDueToTrust()) {
    logForDebugging(
      `Skipping ${hookName} hook execution - workspace trust not accepted`
    );
    return;
  }
  const appState = toolUseContext ? toolUseContext.getAppState() : void 0;
  const sessionId = toolUseContext?.agentId ?? getSessionId();
  const matchingHooks = await getMatchingHooks(
    appState,
    sessionId,
    hookEvent,
    hookInput,
    toolUseContext?.options?.tools
  );
  if (matchingHooks.length === 0) {
    return;
  }
  if (signal?.aborted) {
    return;
  }
  const userHooks = matchingHooks.filter((h) => !isInternalHook(h));
  if (userHooks.length > 0) {
    const pluginHookCounts = getPluginHookCounts(userHooks);
    const hookTypeCounts = getHookTypeCounts(userHooks);
    logEvent(`tengu_run_hook`, {
      hookName,
      numCommands: userHooks.length,
      hookTypeCounts: jsonStringify(
        hookTypeCounts
      ),
      ...pluginHookCounts && {
        pluginHookCounts: jsonStringify(
          pluginHookCounts
        )
      }
    });
  } else {
    const batchStartTime2 = Date.now();
    const context = toolUseContext ? {
      getAppState: toolUseContext.getAppState,
      updateAttributionState: toolUseContext.updateAttributionState
    } : void 0;
    for (const [i, { hook }] of matchingHooks.entries()) {
      if (hook.type === "callback") {
        await hook.callback(hookInput, toolUseID, signal, i, context);
      }
    }
    const totalDurationMs2 = Date.now() - batchStartTime2;
    getStatsStore()?.observe("hook_duration_ms", totalDurationMs2);
    addToTurnHookDuration(totalDurationMs2);
    logEvent(`tengu_repl_hook_finished`, {
      hookName,
      numCommands: matchingHooks.length,
      numSuccess: matchingHooks.length,
      numBlocking: 0,
      numNonBlockingError: 0,
      numCancelled: 0,
      totalDurationMs: totalDurationMs2
    });
    return;
  }
  const hookDefinitionsJson = isBetaTracingEnabled() ? jsonStringify(getHookDefinitionsForTelemetry(matchingHooks)) : "[]";
  if (isBetaTracingEnabled()) {
    void logOTelEvent("hook_execution_start", {
      hook_event: hookEvent,
      hook_name: hookName,
      num_hooks: String(matchingHooks.length),
      managed_only: String(shouldAllowManagedHooksOnly()),
      hook_definitions: hookDefinitionsJson,
      hook_source: shouldAllowManagedHooksOnly() ? "policySettings" : "merged"
    });
  }
  const hookSpan = startHookSpan(
    hookEvent,
    hookName,
    matchingHooks.length,
    hookDefinitionsJson
  );
  for (const { hook } of matchingHooks) {
    yield {
      message: {
        type: "progress",
        data: {
          type: "hook_progress",
          hookEvent,
          hookName,
          command: getHookDisplayText(hook),
          ...hook.type === "prompt" && { promptText: hook.prompt },
          ..."statusMessage" in hook && hook.statusMessage != null && {
            statusMessage: hook.statusMessage
          }
        },
        parentToolUseID: toolUseID,
        toolUseID,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        uuid: randomUUID()
      }
    };
  }
  const batchStartTime = Date.now();
  let jsonInputResult;
  function getJsonInput() {
    if (jsonInputResult !== void 0) {
      return jsonInputResult;
    }
    try {
      return jsonInputResult = { ok: true, value: jsonStringify(hookInput) };
    } catch (error) {
      logError(
        Error(`Failed to stringify hook ${hookName} input`, { cause: error })
      );
      return jsonInputResult = { ok: false, error };
    }
  }
  const hookPromises = matchingHooks.map(async function* ({ hook, pluginRoot, pluginId, skillRoot }, hookIndex) {
    if (hook.type === "callback") {
      const callbackTimeoutMs = hook.timeout ? hook.timeout * 1e3 : timeoutMs;
      const { signal: abortSignal2, cleanup: cleanup2 } = createCombinedAbortSignal(
        signal,
        { timeoutMs: callbackTimeoutMs }
      );
      yield executeHookCallback({
        toolUseID,
        hook,
        hookEvent,
        hookInput,
        signal: abortSignal2,
        hookIndex,
        toolUseContext
      }).finally(cleanup2);
      return;
    }
    if (hook.type === "function") {
      if (!messages) {
        yield {
          message: createAttachmentMessage({
            type: "hook_error_during_execution",
            hookName,
            toolUseID,
            hookEvent,
            content: "Messages not provided for function hook"
          }),
          outcome: "non_blocking_error",
          hook
        };
        return;
      }
      yield executeFunctionHook({
        hook,
        messages,
        hookName,
        toolUseID,
        hookEvent,
        timeoutMs,
        signal
      });
      return;
    }
    const commandTimeoutMs = hook.timeout ? hook.timeout * 1e3 : timeoutMs;
    const { signal: abortSignal, cleanup } = createCombinedAbortSignal(signal, {
      timeoutMs: commandTimeoutMs
    });
    const hookId = randomUUID();
    const hookStartMs = Date.now();
    const hookCommand = getHookDisplayText(hook);
    try {
      const jsonInputRes = getJsonInput();
      if (!jsonInputRes.ok) {
        yield {
          message: createAttachmentMessage({
            type: "hook_error_during_execution",
            hookName,
            toolUseID,
            hookEvent,
            content: `Failed to prepare hook input: ${errorMessage(jsonInputRes.error)}`,
            command: hookCommand,
            durationMs: Date.now() - hookStartMs
          }),
          outcome: "non_blocking_error",
          hook
        };
        cleanup();
        return;
      }
      const jsonInput = jsonInputRes.value;
      if (hook.type === "prompt") {
        if (!toolUseContext) {
          throw new Error(
            "ToolUseContext is required for prompt hooks. This is a bug."
          );
        }
        const promptResult = await execPromptHook(
          hook,
          hookName,
          hookEvent,
          jsonInput,
          abortSignal,
          toolUseContext,
          messages,
          toolUseID
        );
        if (promptResult.message?.type === "attachment") {
          const att = promptResult.message.attachment;
          if (att.type === "hook_success" || att.type === "hook_non_blocking_error") {
            att.command = hookCommand;
            att.durationMs = Date.now() - hookStartMs;
          }
        }
        yield promptResult;
        cleanup?.();
        return;
      }
      if (hook.type === "agent") {
        if (!toolUseContext) {
          throw new Error(
            "ToolUseContext is required for agent hooks. This is a bug."
          );
        }
        if (!messages) {
          throw new Error(
            "Messages are required for agent hooks. This is a bug."
          );
        }
        const agentResult = await execAgentHook(
          hook,
          hookName,
          hookEvent,
          jsonInput,
          abortSignal,
          toolUseContext,
          toolUseID,
          messages,
          "agent_type" in hookInput ? hookInput.agent_type : void 0
        );
        if (agentResult.message?.type === "attachment") {
          const att = agentResult.message.attachment;
          if (att.type === "hook_success" || att.type === "hook_non_blocking_error") {
            att.command = hookCommand;
            att.durationMs = Date.now() - hookStartMs;
          }
        }
        yield agentResult;
        cleanup?.();
        return;
      }
      if (hook.type === "http") {
        emitHookStarted(hookId, hookName, hookEvent);
        const httpResult = await execHttpHook(
          hook,
          hookEvent,
          jsonInput,
          signal
        );
        cleanup?.();
        if (httpResult.aborted) {
          emitHookResponse({
            hookId,
            hookName,
            hookEvent,
            output: "Hook cancelled",
            stdout: "",
            stderr: "",
            exitCode: void 0,
            outcome: "cancelled"
          });
          yield {
            message: createAttachmentMessage({
              type: "hook_cancelled",
              hookName,
              toolUseID,
              hookEvent
            }),
            outcome: "cancelled",
            hook
          };
          return;
        }
        if (httpResult.error || !httpResult.ok) {
          const stderr = httpResult.error || `HTTP ${httpResult.statusCode} from ${hook.url}`;
          emitHookResponse({
            hookId,
            hookName,
            hookEvent,
            output: stderr,
            stdout: "",
            stderr,
            exitCode: httpResult.statusCode,
            outcome: "error"
          });
          yield {
            message: createAttachmentMessage({
              type: "hook_non_blocking_error",
              hookName,
              toolUseID,
              hookEvent,
              stderr,
              stdout: "",
              exitCode: httpResult.statusCode ?? 0
            }),
            outcome: "non_blocking_error",
            hook
          };
          return;
        }
        const { json: httpJson, validationError: httpValidationError } = parseHttpHookOutput(httpResult.body);
        if (httpValidationError) {
          emitHookResponse({
            hookId,
            hookName,
            hookEvent,
            output: httpResult.body,
            stdout: httpResult.body,
            stderr: `JSON validation failed: ${httpValidationError}`,
            exitCode: httpResult.statusCode,
            outcome: "error"
          });
          yield {
            message: createAttachmentMessage({
              type: "hook_non_blocking_error",
              hookName,
              toolUseID,
              hookEvent,
              stderr: `JSON validation failed: ${httpValidationError}`,
              stdout: httpResult.body,
              exitCode: httpResult.statusCode ?? 0
            }),
            outcome: "non_blocking_error",
            hook
          };
          return;
        }
        if (httpJson && isAsyncHookJSONOutput(httpJson)) {
          emitHookResponse({
            hookId,
            hookName,
            hookEvent,
            output: httpResult.body,
            stdout: httpResult.body,
            stderr: "",
            exitCode: httpResult.statusCode,
            outcome: "success"
          });
          yield {
            outcome: "success",
            hook
          };
          return;
        }
        if (httpJson) {
          const processed = processHookJSONOutput({
            json: httpJson,
            command: hook.url,
            hookName,
            toolUseID,
            hookEvent,
            expectedHookEvent: hookEvent,
            stdout: httpResult.body,
            stderr: "",
            exitCode: httpResult.statusCode
          });
          emitHookResponse({
            hookId,
            hookName,
            hookEvent,
            output: httpResult.body,
            stdout: httpResult.body,
            stderr: "",
            exitCode: httpResult.statusCode,
            outcome: "success"
          });
          yield {
            ...processed,
            outcome: "success",
            hook
          };
          return;
        }
        return;
      }
      emitHookStarted(hookId, hookName, hookEvent);
      const result = await execCommandHook(
        hook,
        hookEvent,
        hookName,
        jsonInput,
        abortSignal,
        hookId,
        hookIndex,
        pluginRoot,
        pluginId,
        skillRoot,
        forceSyncExecution,
        boundRequestPrompt
      );
      cleanup?.();
      const durationMs = Date.now() - hookStartMs;
      if (result.backgrounded) {
        yield {
          outcome: "success",
          hook
        };
        return;
      }
      if (result.aborted) {
        emitHookResponse({
          hookId,
          hookName,
          hookEvent,
          output: result.output,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.status,
          outcome: "cancelled"
        });
        yield {
          message: createAttachmentMessage({
            type: "hook_cancelled",
            hookName,
            toolUseID,
            hookEvent,
            command: hookCommand,
            durationMs
          }),
          outcome: "cancelled",
          hook
        };
        return;
      }
      const { json, plainText, validationError } = parseHookOutput(
        result.stdout
      );
      if (validationError) {
        emitHookResponse({
          hookId,
          hookName,
          hookEvent,
          output: result.output,
          stdout: result.stdout,
          stderr: `JSON validation failed: ${validationError}`,
          exitCode: 1,
          outcome: "error"
        });
        yield {
          message: createAttachmentMessage({
            type: "hook_non_blocking_error",
            hookName,
            toolUseID,
            hookEvent,
            stderr: `JSON validation failed: ${validationError}`,
            stdout: result.stdout,
            exitCode: 1,
            command: hookCommand,
            durationMs
          }),
          outcome: "non_blocking_error",
          hook
        };
        return;
      }
      if (json) {
        if (isAsyncHookJSONOutput(json)) {
          yield {
            outcome: "success",
            hook
          };
          return;
        }
        const processed = processHookJSONOutput({
          json,
          command: hookCommand,
          hookName,
          toolUseID,
          hookEvent,
          expectedHookEvent: hookEvent,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.status,
          durationMs
        });
        if (isSyncHookJSONOutput(json) && !json.suppressOutput && plainText && result.status === 0) {
          const content = `${chalk.bold(hookName)} completed`;
          emitHookResponse({
            hookId,
            hookName,
            hookEvent,
            output: result.output,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.status,
            outcome: "success"
          });
          yield {
            ...processed,
            message: processed.message || createAttachmentMessage({
              type: "hook_success",
              hookName,
              toolUseID,
              hookEvent,
              content,
              stdout: result.stdout,
              stderr: result.stderr,
              exitCode: result.status,
              command: hookCommand,
              durationMs
            }),
            outcome: "success",
            hook
          };
          return;
        }
        emitHookResponse({
          hookId,
          hookName,
          hookEvent,
          output: result.output,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.status,
          outcome: result.status === 0 ? "success" : "error"
        });
        yield {
          ...processed,
          outcome: "success",
          hook
        };
        return;
      }
      if (result.status === 0) {
        emitHookResponse({
          hookId,
          hookName,
          hookEvent,
          output: result.output,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.status,
          outcome: "success"
        });
        yield {
          message: createAttachmentMessage({
            type: "hook_success",
            hookName,
            toolUseID,
            hookEvent,
            content: result.stdout.trim(),
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.status,
            command: hookCommand,
            durationMs
          }),
          outcome: "success",
          hook
        };
        return;
      }
      if (result.status === 2) {
        emitHookResponse({
          hookId,
          hookName,
          hookEvent,
          output: result.output,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.status,
          outcome: "error"
        });
        yield {
          blockingError: {
            blockingError: `[${hook.command}]: ${result.stderr || "No stderr output"}`,
            command: hook.command
          },
          outcome: "blocking",
          hook
        };
        return;
      }
      emitHookResponse({
        hookId,
        hookName,
        hookEvent,
        output: result.output,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.status,
        outcome: "error"
      });
      yield {
        message: createAttachmentMessage({
          type: "hook_non_blocking_error",
          hookName,
          toolUseID,
          hookEvent,
          stderr: `Failed with non-blocking status code: ${result.stderr.trim() || "No stderr output"}`,
          stdout: result.stdout,
          exitCode: result.status,
          command: hookCommand,
          durationMs
        }),
        outcome: "non_blocking_error",
        hook
      };
      return;
    } catch (error) {
      cleanup?.();
      const errorMessage2 = error instanceof Error ? error.message : String(error);
      emitHookResponse({
        hookId,
        hookName,
        hookEvent,
        output: `Failed to run: ${errorMessage2}`,
        stdout: "",
        stderr: `Failed to run: ${errorMessage2}`,
        exitCode: 1,
        outcome: "error"
      });
      yield {
        message: createAttachmentMessage({
          type: "hook_non_blocking_error",
          hookName,
          toolUseID,
          hookEvent,
          stderr: `Failed to run: ${errorMessage2}`,
          stdout: "",
          exitCode: 1,
          command: hookCommand,
          durationMs: Date.now() - hookStartMs
        }),
        outcome: "non_blocking_error",
        hook
      };
      return;
    }
  });
  const outcomes = {
    success: 0,
    blocking: 0,
    non_blocking_error: 0,
    cancelled: 0
  };
  let permissionBehavior;
  for await (const result of all(hookPromises)) {
    outcomes[result.outcome]++;
    if (result.preventContinuation) {
      logForDebugging(
        `Hook ${hookEvent} (${getHookDisplayText(result.hook)}) requested preventContinuation`
      );
      yield {
        preventContinuation: true,
        stopReason: result.stopReason
      };
    }
    if (result.blockingError) {
      yield {
        blockingError: result.blockingError
      };
    }
    if (result.message) {
      yield { message: result.message };
    }
    if (result.systemMessage) {
      yield {
        message: createAttachmentMessage({
          type: "hook_system_message",
          content: result.systemMessage,
          hookName,
          toolUseID,
          hookEvent
        })
      };
    }
    if (result.additionalContext) {
      logForDebugging(
        `Hook ${hookEvent} (${getHookDisplayText(result.hook)}) provided additionalContext (${result.additionalContext.length} chars)`
      );
      yield {
        additionalContexts: [result.additionalContext]
      };
    }
    if (result.initialUserMessage) {
      logForDebugging(
        `Hook ${hookEvent} (${getHookDisplayText(result.hook)}) provided initialUserMessage (${result.initialUserMessage.length} chars)`
      );
      yield {
        initialUserMessage: result.initialUserMessage
      };
    }
    if (result.watchPaths && result.watchPaths.length > 0) {
      logForDebugging(
        `Hook ${hookEvent} (${getHookDisplayText(result.hook)}) provided ${result.watchPaths.length} watchPaths`
      );
      yield {
        watchPaths: result.watchPaths
      };
    }
    if (result.updatedMCPToolOutput) {
      logForDebugging(
        `Hook ${hookEvent} (${getHookDisplayText(result.hook)}) replaced MCP tool output`
      );
      yield {
        updatedMCPToolOutput: result.updatedMCPToolOutput
      };
    }
    if (result.permissionBehavior) {
      logForDebugging(
        `Hook ${hookEvent} (${getHookDisplayText(result.hook)}) returned permissionDecision: ${result.permissionBehavior}${result.hookPermissionDecisionReason ? ` (reason: ${result.hookPermissionDecisionReason})` : ""}`
      );
      switch (result.permissionBehavior) {
        case "deny":
          permissionBehavior = "deny";
          break;
        case "ask":
          if (permissionBehavior !== "deny") {
            permissionBehavior = "ask";
          }
          break;
        case "allow":
          if (!permissionBehavior) {
            permissionBehavior = "allow";
          }
          break;
        case "passthrough":
          break;
      }
    }
    if (permissionBehavior !== void 0) {
      const updatedInput = result.updatedInput && (result.permissionBehavior === "allow" || result.permissionBehavior === "ask") ? result.updatedInput : void 0;
      if (updatedInput) {
        logForDebugging(
          `Hook ${hookEvent} (${getHookDisplayText(result.hook)}) modified tool input keys: [${Object.keys(updatedInput).join(", ")}]`
        );
      }
      yield {
        permissionBehavior,
        hookPermissionDecisionReason: result.hookPermissionDecisionReason,
        hookSource: matchingHooks.find((m) => m.hook === result.hook)?.hookSource,
        updatedInput
      };
    }
    if (result.updatedInput && result.permissionBehavior === void 0) {
      logForDebugging(
        `Hook ${hookEvent} (${getHookDisplayText(result.hook)}) modified tool input keys: [${Object.keys(result.updatedInput).join(", ")}]`
      );
      yield {
        updatedInput: result.updatedInput
      };
    }
    if (result.permissionRequestResult) {
      yield {
        permissionRequestResult: result.permissionRequestResult
      };
    }
    if (result.retry) {
      yield {
        retry: result.retry
      };
    }
    if (result.elicitationResponse) {
      yield {
        elicitationResponse: result.elicitationResponse
      };
    }
    if (result.elicitationResultResponse) {
      yield {
        elicitationResultResponse: result.elicitationResultResponse
      };
    }
    if (appState && result.hook.type !== "callback") {
      const sessionId2 = getSessionId();
      const matcher = matchQuery ?? "";
      const hookEntry = getSessionHookCallback(
        appState,
        sessionId2,
        hookEvent,
        matcher,
        result.hook
      );
      if (hookEntry?.onHookSuccess && result.outcome === "success") {
        try {
          hookEntry.onHookSuccess(result.hook, result);
        } catch (error) {
          logError(
            Error("Session hook success callback failed", { cause: error })
          );
        }
      }
    }
  }
  const totalDurationMs = Date.now() - batchStartTime;
  getStatsStore()?.observe("hook_duration_ms", totalDurationMs);
  addToTurnHookDuration(totalDurationMs);
  logEvent(`tengu_repl_hook_finished`, {
    hookName,
    numCommands: matchingHooks.length,
    numSuccess: outcomes.success,
    numBlocking: outcomes.blocking,
    numNonBlockingError: outcomes.non_blocking_error,
    numCancelled: outcomes.cancelled,
    totalDurationMs
  });
  if (isBetaTracingEnabled()) {
    const hookDefinitionsComplete = getHookDefinitionsForTelemetry(matchingHooks);
    void logOTelEvent("hook_execution_complete", {
      hook_event: hookEvent,
      hook_name: hookName,
      num_hooks: String(matchingHooks.length),
      num_success: String(outcomes.success),
      num_blocking: String(outcomes.blocking),
      num_non_blocking_error: String(outcomes.non_blocking_error),
      num_cancelled: String(outcomes.cancelled),
      managed_only: String(shouldAllowManagedHooksOnly()),
      hook_definitions: jsonStringify(hookDefinitionsComplete),
      hook_source: shouldAllowManagedHooksOnly() ? "policySettings" : "merged"
    });
  }
  endHookSpan(hookSpan, {
    numSuccess: outcomes.success,
    numBlocking: outcomes.blocking,
    numNonBlockingError: outcomes.non_blocking_error,
    numCancelled: outcomes.cancelled
  });
}
function hasBlockingResult(results) {
  return results.some((r) => r.blocked);
}
async function executeHooksOutsideREPL({
  getAppState,
  hookInput,
  matchQuery,
  signal,
  timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS
}) {
  if (isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)) {
    return [];
  }
  const hookEvent = hookInput.hook_event_name;
  const hookName = matchQuery ? `${hookEvent}:${matchQuery}` : hookEvent;
  if (shouldDisableAllHooksIncludingManaged()) {
    logForDebugging(
      `Skipping hooks for ${hookName} due to 'disableAllHooks' managed setting`
    );
    return [];
  }
  if (shouldSkipHookDueToTrust()) {
    logForDebugging(
      `Skipping ${hookName} hook execution - workspace trust not accepted`
    );
    return [];
  }
  const appState = getAppState ? getAppState() : void 0;
  const sessionId = getSessionId();
  const matchingHooks = await getMatchingHooks(
    appState,
    sessionId,
    hookEvent,
    hookInput
  );
  if (matchingHooks.length === 0) {
    return [];
  }
  if (signal?.aborted) {
    return [];
  }
  const userHooks = matchingHooks.filter((h) => !isInternalHook(h));
  if (userHooks.length > 0) {
    const pluginHookCounts = getPluginHookCounts(userHooks);
    const hookTypeCounts = getHookTypeCounts(userHooks);
    logEvent(`tengu_run_hook`, {
      hookName,
      numCommands: userHooks.length,
      hookTypeCounts: jsonStringify(
        hookTypeCounts
      ),
      ...pluginHookCounts && {
        pluginHookCounts: jsonStringify(
          pluginHookCounts
        )
      }
    });
  }
  let jsonInput;
  try {
    jsonInput = jsonStringify(hookInput);
  } catch (error) {
    logError(error);
    return [];
  }
  const hookPromises = matchingHooks.map(
    async ({ hook, pluginRoot, pluginId }, hookIndex) => {
      if (hook.type === "callback") {
        const callbackTimeoutMs = hook.timeout ? hook.timeout * 1e3 : timeoutMs;
        const { signal: abortSignal2, cleanup: cleanup2 } = createCombinedAbortSignal(
          signal,
          { timeoutMs: callbackTimeoutMs }
        );
        try {
          const toolUseID = randomUUID();
          const json = await hook.callback(
            hookInput,
            toolUseID,
            abortSignal2,
            hookIndex
          );
          cleanup2?.();
          if (isAsyncHookJSONOutput(json)) {
            logForDebugging(
              `${hookName} [callback] returned async response, returning empty output`
            );
            return {
              command: "callback",
              succeeded: true,
              output: "",
              blocked: false
            };
          }
          const output = hookEvent === "WorktreeCreate" && isSyncHookJSONOutput(json) && json.hookSpecificOutput?.hookEventName === "WorktreeCreate" ? json.hookSpecificOutput.worktreePath : json.systemMessage || "";
          const blocked = isSyncHookJSONOutput(json) && json.decision === "block";
          logForDebugging(`${hookName} [callback] completed successfully`);
          return {
            command: "callback",
            succeeded: true,
            output,
            blocked
          };
        } catch (error) {
          cleanup2?.();
          const errorMessage2 = error instanceof Error ? error.message : String(error);
          logForDebugging(
            `${hookName} [callback] failed to run: ${errorMessage2}`,
            { level: "error" }
          );
          return {
            command: "callback",
            succeeded: false,
            output: errorMessage2,
            blocked: false
          };
        }
      }
      if (hook.type === "prompt") {
        return {
          command: hook.prompt,
          succeeded: false,
          output: "Prompt stop hooks are not yet supported outside REPL",
          blocked: false
        };
      }
      if (hook.type === "agent") {
        return {
          command: hook.prompt,
          succeeded: false,
          output: "Agent stop hooks are not yet supported outside REPL",
          blocked: false
        };
      }
      if (hook.type === "function") {
        logError(
          new Error(
            `Function hook reached executeHooksOutsideREPL for ${hookEvent}. Function hooks should only be used in REPL context (Stop hooks).`
          )
        );
        return {
          command: "function",
          succeeded: false,
          output: "Internal error: function hook executed outside REPL context",
          blocked: false
        };
      }
      if (hook.type === "http") {
        try {
          const httpResult = await execHttpHook(
            hook,
            hookEvent,
            jsonInput,
            signal
          );
          if (httpResult.aborted) {
            logForDebugging(`${hookName} [${hook.url}] cancelled`);
            return {
              command: hook.url,
              succeeded: false,
              output: "Hook cancelled",
              blocked: false
            };
          }
          if (httpResult.error || !httpResult.ok) {
            const errMsg = httpResult.error || `HTTP ${httpResult.statusCode} from ${hook.url}`;
            logForDebugging(`${hookName} [${hook.url}] failed: ${errMsg}`, {
              level: "error"
            });
            return {
              command: hook.url,
              succeeded: false,
              output: errMsg,
              blocked: false
            };
          }
          const { json: httpJson, validationError: httpValidationError } = parseHttpHookOutput(httpResult.body);
          if (httpValidationError) {
            throw new Error(httpValidationError);
          }
          if (httpJson && !isAsyncHookJSONOutput(httpJson)) {
            logForDebugging(
              `Parsed JSON output from HTTP hook: ${jsonStringify(httpJson)}`,
              { level: "verbose" }
            );
          }
          const jsonBlocked = httpJson && !isAsyncHookJSONOutput(httpJson) && isSyncHookJSONOutput(httpJson) && httpJson.decision === "block";
          const output = hookEvent === "WorktreeCreate" ? httpJson && isSyncHookJSONOutput(httpJson) && httpJson.hookSpecificOutput?.hookEventName === "WorktreeCreate" ? httpJson.hookSpecificOutput.worktreePath : "" : httpResult.body;
          return {
            command: hook.url,
            succeeded: true,
            output,
            blocked: !!jsonBlocked
          };
        } catch (error) {
          const errorMessage2 = error instanceof Error ? error.message : String(error);
          logForDebugging(
            `${hookName} [${hook.url}] failed to run: ${errorMessage2}`,
            { level: "error" }
          );
          return {
            command: hook.url,
            succeeded: false,
            output: errorMessage2,
            blocked: false
          };
        }
      }
      const commandTimeoutMs = hook.timeout ? hook.timeout * 1e3 : timeoutMs;
      const { signal: abortSignal, cleanup } = createCombinedAbortSignal(
        signal,
        { timeoutMs: commandTimeoutMs }
      );
      try {
        const result = await execCommandHook(
          hook,
          hookEvent,
          hookName,
          jsonInput,
          abortSignal,
          randomUUID(),
          hookIndex,
          pluginRoot,
          pluginId
        );
        cleanup?.();
        if (result.aborted) {
          logForDebugging(`${hookName} [${hook.command}] cancelled`);
          return {
            command: hook.command,
            succeeded: false,
            output: "Hook cancelled",
            blocked: false
          };
        }
        logForDebugging(
          `${hookName} [${hook.command}] completed with status ${result.status}`
        );
        const { json, validationError } = parseHookOutput(result.stdout);
        if (validationError) {
          throw new Error(validationError);
        }
        if (json && !isAsyncHookJSONOutput(json)) {
          logForDebugging(
            `Parsed JSON output from hook: ${jsonStringify(json)}`,
            { level: "verbose" }
          );
        }
        const jsonBlocked = json && !isAsyncHookJSONOutput(json) && isSyncHookJSONOutput(json) && json.decision === "block";
        const blocked = result.status === 2 || !!jsonBlocked;
        const output = result.status === 0 ? result.stdout || "" : result.stderr || "";
        const watchPaths = json && isSyncHookJSONOutput(json) && json.hookSpecificOutput && "watchPaths" in json.hookSpecificOutput ? json.hookSpecificOutput.watchPaths : void 0;
        const systemMessage = json && isSyncHookJSONOutput(json) ? json.systemMessage : void 0;
        return {
          command: hook.command,
          succeeded: result.status === 0,
          output,
          blocked,
          watchPaths,
          systemMessage
        };
      } catch (error) {
        cleanup?.();
        const errorMessage2 = error instanceof Error ? error.message : String(error);
        logForDebugging(
          `${hookName} [${hook.command}] failed to run: ${errorMessage2}`,
          { level: "error" }
        );
        return {
          command: hook.command,
          succeeded: false,
          output: errorMessage2,
          blocked: false
        };
      }
    }
  );
  return await Promise.all(hookPromises);
}
async function* executePreToolHooks(toolName, toolUseID, toolInput, toolUseContext, permissionMode, signal, timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS, requestPrompt, toolInputSummary) {
  const appState = toolUseContext.getAppState();
  const sessionId = toolUseContext.agentId ?? getSessionId();
  if (!hasHookForEvent("PreToolUse", appState, sessionId)) {
    return;
  }
  logForDebugging(`executePreToolHooks called for tool: ${toolName}`, {
    level: "verbose"
  });
  const hookInput = {
    ...createBaseHookInput(permissionMode, void 0, toolUseContext),
    hook_event_name: "PreToolUse",
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: toolUseID
  };
  yield* executeHooks({
    hookInput,
    toolUseID,
    matchQuery: toolName,
    signal,
    timeoutMs,
    toolUseContext,
    requestPrompt,
    toolInputSummary
  });
}
async function* executePostToolHooks(toolName, toolUseID, toolInput, toolResponse, toolUseContext, permissionMode, signal, timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS) {
  const hookInput = {
    ...createBaseHookInput(permissionMode, void 0, toolUseContext),
    hook_event_name: "PostToolUse",
    tool_name: toolName,
    tool_input: toolInput,
    tool_response: toolResponse,
    tool_use_id: toolUseID
  };
  yield* executeHooks({
    hookInput,
    toolUseID,
    matchQuery: toolName,
    signal,
    timeoutMs,
    toolUseContext
  });
}
async function* executePostToolUseFailureHooks(toolName, toolUseID, toolInput, error, toolUseContext, isInterrupt, permissionMode, signal, timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS) {
  const appState = toolUseContext.getAppState();
  const sessionId = toolUseContext.agentId ?? getSessionId();
  if (!hasHookForEvent("PostToolUseFailure", appState, sessionId)) {
    return;
  }
  const hookInput = {
    ...createBaseHookInput(permissionMode, void 0, toolUseContext),
    hook_event_name: "PostToolUseFailure",
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: toolUseID,
    error,
    is_interrupt: isInterrupt
  };
  yield* executeHooks({
    hookInput,
    toolUseID,
    matchQuery: toolName,
    signal,
    timeoutMs,
    toolUseContext
  });
}
async function* executePermissionDeniedHooks(toolName, toolUseID, toolInput, reason, toolUseContext, permissionMode, signal, timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS) {
  const appState = toolUseContext.getAppState();
  const sessionId = toolUseContext.agentId ?? getSessionId();
  if (!hasHookForEvent("PermissionDenied", appState, sessionId)) {
    return;
  }
  const hookInput = {
    ...createBaseHookInput(permissionMode, void 0, toolUseContext),
    hook_event_name: "PermissionDenied",
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: toolUseID,
    reason
  };
  yield* executeHooks({
    hookInput,
    toolUseID,
    matchQuery: toolName,
    signal,
    timeoutMs,
    toolUseContext
  });
}
async function executeNotificationHooks(notificationData, timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS) {
  const { message, title, notificationType } = notificationData;
  const hookInput = {
    ...createBaseHookInput(void 0),
    hook_event_name: "Notification",
    message,
    title,
    notification_type: notificationType
  };
  await executeHooksOutsideREPL({
    hookInput,
    timeoutMs,
    matchQuery: notificationType
  });
}
async function executeStopFailureHooks(lastMessage, toolUseContext, timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS) {
  const appState = toolUseContext?.getAppState();
  const sessionId = getSessionId();
  if (!hasHookForEvent("StopFailure", appState, sessionId)) return;
  const lastAssistantText = extractTextContent(lastMessage.message.content, "\n").trim() || void 0;
  const error = lastMessage.error ?? "unknown";
  const hookInput = {
    ...createBaseHookInput(void 0, void 0, toolUseContext),
    hook_event_name: "StopFailure",
    error,
    error_details: lastMessage.errorDetails,
    last_assistant_message: lastAssistantText
  };
  await executeHooksOutsideREPL({
    getAppState: toolUseContext?.getAppState,
    hookInput,
    timeoutMs,
    matchQuery: error
  });
}
async function* executeStopHooks(permissionMode, signal, timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS, stopHookActive = false, subagentId, toolUseContext, messages, agentType, requestPrompt) {
  const hookEvent = subagentId ? "SubagentStop" : "Stop";
  const appState = toolUseContext?.getAppState();
  const sessionId = toolUseContext?.agentId ?? getSessionId();
  if (!hasHookForEvent(hookEvent, appState, sessionId)) {
    return;
  }
  const lastAssistantMessage = messages ? getLastAssistantMessage(messages) : void 0;
  const lastAssistantText = lastAssistantMessage ? extractTextContent(lastAssistantMessage.message.content, "\n").trim() || void 0 : void 0;
  const hookInput = subagentId ? {
    ...createBaseHookInput(permissionMode),
    hook_event_name: "SubagentStop",
    stop_hook_active: stopHookActive,
    agent_id: subagentId,
    agent_transcript_path: getAgentTranscriptPath(subagentId),
    agent_type: agentType ?? "",
    last_assistant_message: lastAssistantText
  } : {
    ...createBaseHookInput(permissionMode),
    hook_event_name: "Stop",
    stop_hook_active: stopHookActive,
    last_assistant_message: lastAssistantText
  };
  yield* executeHooks({
    hookInput,
    toolUseID: randomUUID(),
    signal,
    timeoutMs,
    toolUseContext,
    messages,
    requestPrompt
  });
}
async function* executeTeammateIdleHooks(teammateName, teamName, permissionMode, signal, timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS) {
  const hookInput = {
    ...createBaseHookInput(permissionMode),
    hook_event_name: "TeammateIdle",
    teammate_name: teammateName,
    team_name: teamName
  };
  yield* executeHooks({
    hookInput,
    toolUseID: randomUUID(),
    signal,
    timeoutMs
  });
}
async function* executeTaskCreatedHooks(taskId, taskSubject, taskDescription, teammateName, teamName, permissionMode, signal, timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS, toolUseContext) {
  const hookInput = {
    ...createBaseHookInput(permissionMode),
    hook_event_name: "TaskCreated",
    task_id: taskId,
    task_subject: taskSubject,
    task_description: taskDescription,
    teammate_name: teammateName,
    team_name: teamName
  };
  yield* executeHooks({
    hookInput,
    toolUseID: randomUUID(),
    signal,
    timeoutMs,
    toolUseContext
  });
}
async function* executeTaskCompletedHooks(taskId, taskSubject, taskDescription, teammateName, teamName, permissionMode, signal, timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS, toolUseContext) {
  const hookInput = {
    ...createBaseHookInput(permissionMode),
    hook_event_name: "TaskCompleted",
    task_id: taskId,
    task_subject: taskSubject,
    task_description: taskDescription,
    teammate_name: teammateName,
    team_name: teamName
  };
  yield* executeHooks({
    hookInput,
    toolUseID: randomUUID(),
    signal,
    timeoutMs,
    toolUseContext
  });
}
async function* executeUserPromptSubmitHooks(prompt, permissionMode, toolUseContext, requestPrompt) {
  const appState = toolUseContext.getAppState();
  const sessionId = toolUseContext.agentId ?? getSessionId();
  if (!hasHookForEvent("UserPromptSubmit", appState, sessionId)) {
    return;
  }
  const hookInput = {
    ...createBaseHookInput(permissionMode),
    hook_event_name: "UserPromptSubmit",
    prompt
  };
  yield* executeHooks({
    hookInput,
    toolUseID: randomUUID(),
    signal: toolUseContext.abortController.signal,
    timeoutMs: TOOL_HOOK_EXECUTION_TIMEOUT_MS,
    toolUseContext,
    requestPrompt
  });
}
async function* executeSessionStartHooks(source, sessionId, agentType, model, signal, timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS, forceSyncExecution) {
  const hookInput = {
    ...createBaseHookInput(void 0, sessionId),
    hook_event_name: "SessionStart",
    source,
    agent_type: agentType,
    model
  };
  yield* executeHooks({
    hookInput,
    toolUseID: randomUUID(),
    matchQuery: source,
    signal,
    timeoutMs,
    forceSyncExecution
  });
}
async function* executeSetupHooks(trigger, signal, timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS, forceSyncExecution) {
  const hookInput = {
    ...createBaseHookInput(void 0),
    hook_event_name: "Setup",
    trigger
  };
  yield* executeHooks({
    hookInput,
    toolUseID: randomUUID(),
    matchQuery: trigger,
    signal,
    timeoutMs,
    forceSyncExecution
  });
}
async function* executeSubagentStartHooks(agentId, agentType, signal, timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS) {
  const hookInput = {
    ...createBaseHookInput(void 0),
    hook_event_name: "SubagentStart",
    agent_id: agentId,
    agent_type: agentType
  };
  yield* executeHooks({
    hookInput,
    toolUseID: randomUUID(),
    matchQuery: agentType,
    signal,
    timeoutMs
  });
}
async function executePreCompactHooks(compactData, signal, timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS) {
  const hookInput = {
    ...createBaseHookInput(void 0),
    hook_event_name: "PreCompact",
    trigger: compactData.trigger,
    custom_instructions: compactData.customInstructions
  };
  const results = await executeHooksOutsideREPL({
    hookInput,
    matchQuery: compactData.trigger,
    signal,
    timeoutMs
  });
  if (results.length === 0) {
    return {};
  }
  const successfulOutputs = results.filter((result) => result.succeeded && result.output.trim().length > 0).map((result) => result.output.trim());
  const displayMessages = [];
  for (const result of results) {
    if (result.succeeded) {
      if (result.output.trim()) {
        displayMessages.push(
          `PreCompact [${result.command}] completed successfully: ${result.output.trim()}`
        );
      } else {
        displayMessages.push(
          `PreCompact [${result.command}] completed successfully`
        );
      }
    } else {
      if (result.output.trim()) {
        displayMessages.push(
          `PreCompact [${result.command}] failed: ${result.output.trim()}`
        );
      } else {
        displayMessages.push(`PreCompact [${result.command}] failed`);
      }
    }
  }
  return {
    newCustomInstructions: successfulOutputs.length > 0 ? successfulOutputs.join("\n\n") : void 0,
    userDisplayMessage: displayMessages.length > 0 ? displayMessages.join("\n") : void 0
  };
}
async function executePostCompactHooks(compactData, signal, timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS) {
  const hookInput = {
    ...createBaseHookInput(void 0),
    hook_event_name: "PostCompact",
    trigger: compactData.trigger,
    compact_summary: compactData.compactSummary
  };
  const results = await executeHooksOutsideREPL({
    hookInput,
    matchQuery: compactData.trigger,
    signal,
    timeoutMs
  });
  if (results.length === 0) {
    return {};
  }
  const displayMessages = [];
  for (const result of results) {
    if (result.succeeded) {
      if (result.output.trim()) {
        displayMessages.push(
          `PostCompact [${result.command}] completed successfully: ${result.output.trim()}`
        );
      } else {
        displayMessages.push(
          `PostCompact [${result.command}] completed successfully`
        );
      }
    } else {
      if (result.output.trim()) {
        displayMessages.push(
          `PostCompact [${result.command}] failed: ${result.output.trim()}`
        );
      } else {
        displayMessages.push(`PostCompact [${result.command}] failed`);
      }
    }
  }
  return {
    userDisplayMessage: displayMessages.length > 0 ? displayMessages.join("\n") : void 0
  };
}
async function executeSessionEndHooks(reason, options) {
  const {
    getAppState,
    setAppState,
    signal,
    timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS
  } = options || {};
  const hookInput = {
    ...createBaseHookInput(void 0),
    hook_event_name: "SessionEnd",
    reason
  };
  const results = await executeHooksOutsideREPL({
    getAppState,
    hookInput,
    matchQuery: reason,
    signal,
    timeoutMs
  });
  for (const result of results) {
    if (!result.succeeded && result.output) {
      process.stderr.write(
        `SessionEnd hook [${result.command}] failed: ${result.output}
`
      );
    }
  }
  if (setAppState) {
    const sessionId = getSessionId();
    clearSessionHooks(setAppState, sessionId);
  }
}
async function* executePermissionRequestHooks(toolName, toolUseID, toolInput, toolUseContext, permissionMode, permissionSuggestions, signal, timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS, requestPrompt, toolInputSummary) {
  logForDebugging(`executePermissionRequestHooks called for tool: ${toolName}`);
  const hookInput = {
    ...createBaseHookInput(permissionMode, void 0, toolUseContext),
    hook_event_name: "PermissionRequest",
    tool_name: toolName,
    tool_input: toolInput,
    permission_suggestions: permissionSuggestions
  };
  yield* executeHooks({
    hookInput,
    toolUseID,
    matchQuery: toolName,
    signal,
    timeoutMs,
    toolUseContext,
    requestPrompt,
    toolInputSummary
  });
}
async function executeConfigChangeHooks(source, filePath, timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS) {
  const hookInput = {
    ...createBaseHookInput(void 0),
    hook_event_name: "ConfigChange",
    source,
    file_path: filePath
  };
  const results = await executeHooksOutsideREPL({
    hookInput,
    timeoutMs,
    matchQuery: source
  });
  if (source === "policy_settings") {
    return results.map((r) => ({ ...r, blocked: false }));
  }
  return results;
}
async function executeEnvHooks(hookInput, timeoutMs) {
  const results = await executeHooksOutsideREPL({ hookInput, timeoutMs });
  if (results.length > 0) {
    invalidateSessionEnvCache();
  }
  const watchPaths = results.flatMap((r) => r.watchPaths ?? []);
  const systemMessages = results.map((r) => r.systemMessage).filter((m) => !!m);
  return { results, watchPaths, systemMessages };
}
function executeCwdChangedHooks(oldCwd, newCwd, timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS) {
  const hookInput = {
    ...createBaseHookInput(void 0),
    hook_event_name: "CwdChanged",
    old_cwd: oldCwd,
    new_cwd: newCwd
  };
  return executeEnvHooks(hookInput, timeoutMs);
}
function executeFileChangedHooks(filePath, event, timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS) {
  const hookInput = {
    ...createBaseHookInput(void 0),
    hook_event_name: "FileChanged",
    file_path: filePath,
    event
  };
  return executeEnvHooks(hookInput, timeoutMs);
}
function hasInstructionsLoadedHook() {
  const snapshotHooks = getHooksConfigFromSnapshot()?.["InstructionsLoaded"];
  if (snapshotHooks && snapshotHooks.length > 0) return true;
  const registeredHooks = getRegisteredHooks()?.["InstructionsLoaded"];
  if (registeredHooks && registeredHooks.length > 0) return true;
  return false;
}
async function executeInstructionsLoadedHooks(filePath, memoryType, loadReason, options) {
  const {
    globs,
    triggerFilePath,
    parentFilePath,
    timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS
  } = options ?? {};
  const hookInput = {
    ...createBaseHookInput(void 0),
    hook_event_name: "InstructionsLoaded",
    file_path: filePath,
    memory_type: memoryType,
    load_reason: loadReason,
    globs,
    trigger_file_path: triggerFilePath,
    parent_file_path: parentFilePath
  };
  await executeHooksOutsideREPL({
    hookInput,
    timeoutMs,
    matchQuery: loadReason
  });
}
function parseElicitationHookOutput(result, expectedEventName) {
  if (result.blocked && !result.succeeded) {
    return {
      blockingError: {
        blockingError: result.output || `Elicitation blocked by hook`,
        command: result.command
      }
    };
  }
  if (!result.output.trim()) {
    return {};
  }
  const trimmed = result.output.trim();
  if (!trimmed.startsWith("{")) {
    return {};
  }
  try {
    const parsed = hookJSONOutputSchema().parse(JSON.parse(trimmed));
    if (isAsyncHookJSONOutput(parsed)) {
      return {};
    }
    if (!isSyncHookJSONOutput(parsed)) {
      return {};
    }
    if (parsed.decision === "block" || result.blocked) {
      return {
        blockingError: {
          blockingError: parsed.reason || "Elicitation blocked by hook",
          command: result.command
        }
      };
    }
    const specific = parsed.hookSpecificOutput;
    if (!specific || specific.hookEventName !== expectedEventName) {
      return {};
    }
    if (!specific.action) {
      return {};
    }
    const response = {
      action: specific.action,
      content: specific.content
    };
    const out = { response };
    if (specific.action === "decline") {
      out.blockingError = {
        blockingError: parsed.reason || (expectedEventName === "Elicitation" ? "Elicitation denied by hook" : "Elicitation result blocked by hook"),
        command: result.command
      };
    }
    return out;
  } catch {
    return {};
  }
}
async function executeElicitationHooks({
  serverName,
  message,
  requestedSchema,
  permissionMode,
  signal,
  timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
  mode,
  url,
  elicitationId
}) {
  const hookInput = {
    ...createBaseHookInput(permissionMode),
    hook_event_name: "Elicitation",
    mcp_server_name: serverName,
    message,
    mode,
    url,
    elicitation_id: elicitationId,
    requested_schema: requestedSchema
  };
  const results = await executeHooksOutsideREPL({
    hookInput,
    matchQuery: serverName,
    signal,
    timeoutMs
  });
  let elicitationResponse;
  let blockingError;
  for (const result of results) {
    const parsed = parseElicitationHookOutput(result, "Elicitation");
    if (parsed.blockingError) {
      blockingError = parsed.blockingError;
    }
    if (parsed.response) {
      elicitationResponse = parsed.response;
    }
  }
  return { elicitationResponse, blockingError };
}
async function executeElicitationResultHooks({
  serverName,
  action,
  content,
  permissionMode,
  signal,
  timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
  mode,
  elicitationId
}) {
  const hookInput = {
    ...createBaseHookInput(permissionMode),
    hook_event_name: "ElicitationResult",
    mcp_server_name: serverName,
    elicitation_id: elicitationId,
    mode,
    action,
    content
  };
  const results = await executeHooksOutsideREPL({
    hookInput,
    matchQuery: serverName,
    signal,
    timeoutMs
  });
  let elicitationResultResponse;
  let blockingError;
  for (const result of results) {
    const parsed = parseElicitationHookOutput(result, "ElicitationResult");
    if (parsed.blockingError) {
      blockingError = parsed.blockingError;
    }
    if (parsed.response) {
      elicitationResultResponse = parsed.response;
    }
  }
  return { elicitationResultResponse, blockingError };
}
async function executeStatusLineCommand(statusLineInput, signal, timeoutMs = 5e3, logResult = false) {
  if (shouldDisableAllHooksIncludingManaged()) {
    return void 0;
  }
  if (shouldSkipHookDueToTrust()) {
    logForDebugging(
      `Skipping StatusLine command execution - workspace trust not accepted`
    );
    return void 0;
  }
  let statusLine;
  if (shouldAllowManagedHooksOnly()) {
    statusLine = getSettingsForSource("policySettings")?.statusLine;
  } else {
    statusLine = getSettings_DEPRECATED()?.statusLine;
  }
  if (!statusLine || statusLine.type !== "command") {
    return void 0;
  }
  const abortSignal = signal || AbortSignal.timeout(timeoutMs);
  try {
    const jsonInput = jsonStringify(statusLineInput);
    const result = await execCommandHook(
      statusLine,
      "StatusLine",
      "statusLine",
      jsonInput,
      abortSignal,
      randomUUID()
    );
    if (result.aborted) {
      return void 0;
    }
    if (result.status === 0) {
      const output = result.stdout.trim().split("\n").flatMap((line) => line.trim() || []).join("\n");
      if (output) {
        if (logResult) {
          logForDebugging(
            `StatusLine [${statusLine.command}] completed with status ${result.status}`
          );
        }
        return output;
      }
    } else if (logResult) {
      logForDebugging(
        `StatusLine [${statusLine.command}] completed with status ${result.status}`,
        { level: "warn" }
      );
    }
    return void 0;
  } catch (error) {
    logForDebugging(`Status hook failed: ${error}`, { level: "error" });
    return void 0;
  }
}
async function executeFileSuggestionCommand(fileSuggestionInput, signal, timeoutMs = 5e3) {
  if (shouldDisableAllHooksIncludingManaged()) {
    return [];
  }
  if (shouldSkipHookDueToTrust()) {
    logForDebugging(
      `Skipping FileSuggestion command execution - workspace trust not accepted`
    );
    return [];
  }
  let fileSuggestion;
  if (shouldAllowManagedHooksOnly()) {
    fileSuggestion = getSettingsForSource("policySettings")?.fileSuggestion;
  } else {
    fileSuggestion = getSettings_DEPRECATED()?.fileSuggestion;
  }
  if (!fileSuggestion || fileSuggestion.type !== "command") {
    return [];
  }
  const abortSignal = signal || AbortSignal.timeout(timeoutMs);
  try {
    const jsonInput = jsonStringify(fileSuggestionInput);
    const hook = { type: "command", command: fileSuggestion.command };
    const result = await execCommandHook(
      hook,
      "FileSuggestion",
      "FileSuggestion",
      jsonInput,
      abortSignal,
      randomUUID()
    );
    if (result.aborted || result.status !== 0) {
      return [];
    }
    return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  } catch (error) {
    logForDebugging(`File suggestion helper failed: ${error}`, {
      level: "error"
    });
    return [];
  }
}
async function executeFunctionHook({
  hook,
  messages,
  hookName,
  toolUseID,
  hookEvent,
  timeoutMs,
  signal
}) {
  const callbackTimeoutMs = hook.timeout ?? timeoutMs;
  const { signal: abortSignal, cleanup } = createCombinedAbortSignal(signal, {
    timeoutMs: callbackTimeoutMs
  });
  try {
    if (abortSignal.aborted) {
      cleanup();
      return {
        outcome: "cancelled",
        hook
      };
    }
    const passed = await new Promise((resolve, reject) => {
      const onAbort = () => reject(new Error("Function hook cancelled"));
      abortSignal.addEventListener("abort", onAbort);
      Promise.resolve(hook.callback(messages, abortSignal)).then((result) => {
        abortSignal.removeEventListener("abort", onAbort);
        resolve(result);
      }).catch((error) => {
        abortSignal.removeEventListener("abort", onAbort);
        reject(error);
      });
    });
    cleanup();
    if (passed) {
      return {
        outcome: "success",
        hook
      };
    }
    return {
      blockingError: {
        blockingError: hook.errorMessage,
        command: "function"
      },
      outcome: "blocking",
      hook
    };
  } catch (error) {
    cleanup();
    if (error instanceof Error && (error.message === "Function hook cancelled" || error.name === "AbortError")) {
      return {
        outcome: "cancelled",
        hook
      };
    }
    logError(error);
    return {
      message: createAttachmentMessage({
        type: "hook_error_during_execution",
        hookName,
        toolUseID,
        hookEvent,
        content: error instanceof Error ? error.message : "Function hook execution error"
      }),
      outcome: "non_blocking_error",
      hook
    };
  }
}
async function executeHookCallback({
  toolUseID,
  hook,
  hookEvent,
  hookInput,
  signal,
  hookIndex,
  toolUseContext
}) {
  const context = toolUseContext ? {
    getAppState: toolUseContext.getAppState,
    updateAttributionState: toolUseContext.updateAttributionState
  } : void 0;
  const json = await hook.callback(
    hookInput,
    toolUseID,
    signal,
    hookIndex,
    context
  );
  if (isAsyncHookJSONOutput(json)) {
    return {
      outcome: "success",
      hook
    };
  }
  const processed = processHookJSONOutput({
    json,
    command: "callback",
    // TODO: If the hook came from a plugin, use the full path to the plugin for easier debugging
    hookName: `${hookEvent}:Callback`,
    toolUseID,
    hookEvent,
    expectedHookEvent: hookEvent,
    // Callbacks don't have stdout/stderr/exitCode
    stdout: void 0,
    stderr: void 0,
    exitCode: void 0
  });
  return {
    ...processed,
    outcome: "success",
    hook
  };
}
function hasWorktreeCreateHook() {
  const snapshotHooks = getHooksConfigFromSnapshot()?.["WorktreeCreate"];
  if (snapshotHooks && snapshotHooks.length > 0) return true;
  const registeredHooks = getRegisteredHooks()?.["WorktreeCreate"];
  if (!registeredHooks || registeredHooks.length === 0) return false;
  const managedOnly = shouldAllowManagedHooksOnly();
  return registeredHooks.some(
    (matcher) => !(managedOnly && "pluginRoot" in matcher)
  );
}
async function executeWorktreeCreateHook(name) {
  const hookInput = {
    ...createBaseHookInput(void 0),
    hook_event_name: "WorktreeCreate",
    name
  };
  const results = await executeHooksOutsideREPL({
    hookInput,
    timeoutMs: TOOL_HOOK_EXECUTION_TIMEOUT_MS
  });
  const successfulResult = results.find(
    (r) => r.succeeded && r.output.trim().length > 0
  );
  if (!successfulResult) {
    const failedOutputs = results.filter((r) => !r.succeeded).map((r) => `${r.command}: ${r.output.trim() || "no output"}`);
    throw new Error(
      `WorktreeCreate hook failed: ${failedOutputs.join("; ") || "no successful output"}`
    );
  }
  const worktreePath = successfulResult.output.trim();
  return { worktreePath };
}
async function executeWorktreeRemoveHook(worktreePath) {
  const snapshotHooks = getHooksConfigFromSnapshot()?.["WorktreeRemove"];
  const registeredHooks = getRegisteredHooks()?.["WorktreeRemove"];
  const hasSnapshotHooks = snapshotHooks && snapshotHooks.length > 0;
  const hasRegisteredHooks = registeredHooks && registeredHooks.length > 0;
  if (!hasSnapshotHooks && !hasRegisteredHooks) {
    return false;
  }
  const hookInput = {
    ...createBaseHookInput(void 0),
    hook_event_name: "WorktreeRemove",
    worktree_path: worktreePath
  };
  const results = await executeHooksOutsideREPL({
    hookInput,
    timeoutMs: TOOL_HOOK_EXECUTION_TIMEOUT_MS
  });
  if (results.length === 0) {
    return false;
  }
  for (const result of results) {
    if (!result.succeeded) {
      logForDebugging(
        `WorktreeRemove hook failed [${result.command}]: ${result.output.trim()}`,
        { level: "error" }
      );
    }
  }
  return true;
}
function getHookDefinitionsForTelemetry(matchedHooks) {
  return matchedHooks.map(({ hook }) => {
    if (hook.type === "command") {
      return { type: "command", command: hook.command };
    } else if (hook.type === "prompt") {
      return { type: "prompt", prompt: hook.prompt };
    } else if (hook.type === "http") {
      return { type: "http", command: hook.url };
    } else if (hook.type === "function") {
      return { type: "function", name: "function" };
    } else if (hook.type === "callback") {
      return { type: "callback", name: "callback" };
    }
    return { type: "unknown" };
  });
}
export {
  createBaseHookInput,
  executeConfigChangeHooks,
  executeCwdChangedHooks,
  executeElicitationHooks,
  executeElicitationResultHooks,
  executeFileChangedHooks,
  executeFileSuggestionCommand,
  executeInstructionsLoadedHooks,
  executeNotificationHooks,
  executePermissionDeniedHooks,
  executePermissionRequestHooks,
  executePostCompactHooks,
  executePostToolHooks,
  executePostToolUseFailureHooks,
  executePreCompactHooks,
  executePreToolHooks,
  executeSessionEndHooks,
  executeSessionStartHooks,
  executeSetupHooks,
  executeStatusLineCommand,
  executeStopFailureHooks,
  executeStopHooks,
  executeSubagentStartHooks,
  executeTaskCompletedHooks,
  executeTaskCreatedHooks,
  executeTeammateIdleHooks,
  executeUserPromptSubmitHooks,
  executeWorktreeCreateHook,
  executeWorktreeRemoveHook,
  getMatchingHooks,
  getPreToolHookBlockingMessage,
  getSessionEndHookTimeoutMs,
  getStopHookMessage,
  getTaskCompletedHookMessage,
  getTaskCreatedHookMessage,
  getTeammateIdleHookMessage,
  getUserPromptSubmitHookBlockingMessage,
  hasBlockingResult,
  hasInstructionsLoadedHook,
  hasWorktreeCreateHook,
  shouldSkipHookDueToTrust
};
