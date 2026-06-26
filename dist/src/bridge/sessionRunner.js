import { spawn } from "child_process";
import { createWriteStream } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { createInterface } from "readline";
import { jsonParse, jsonStringify } from "../utils/slowOperations.js";
import { debugTruncate } from "./debugUtils.js";
const MAX_ACTIVITIES = 10;
const MAX_STDERR_LINES = 10;
function safeFilenameId(id) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}
const TOOL_VERBS = {
  Read: "Reading",
  Write: "Writing",
  Edit: "Editing",
  MultiEdit: "Editing",
  Bash: "Running",
  Glob: "Searching",
  Grep: "Searching",
  WebFetch: "Fetching",
  WebSearch: "Searching",
  Task: "Running task",
  FileReadTool: "Reading",
  FileWriteTool: "Writing",
  FileEditTool: "Editing",
  GlobTool: "Searching",
  GrepTool: "Searching",
  BashTool: "Running",
  NotebookEditTool: "Editing notebook",
  LSP: "LSP"
};
function toolSummary(name, input) {
  const verb = TOOL_VERBS[name] ?? name;
  const target = input.file_path ?? input.filePath ?? input.pattern ?? input.command?.slice(0, 60) ?? input.url ?? input.query ?? "";
  if (target) {
    return `${verb} ${target}`;
  }
  return verb;
}
function extractActivities(line, sessionId, onDebug) {
  let parsed;
  try {
    parsed = jsonParse(line);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") {
    return [];
  }
  const msg = parsed;
  const activities = [];
  const now = Date.now();
  switch (msg.type) {
    case "assistant": {
      const message = msg.message;
      if (!message) break;
      const content = message.content;
      if (!Array.isArray(content)) break;
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        const b = block;
        if (b.type === "tool_use") {
          const name = b.name ?? "Tool";
          const input = b.input ?? {};
          const summary = toolSummary(name, input);
          activities.push({
            type: "tool_start",
            summary,
            timestamp: now
          });
          onDebug(
            `[bridge:activity] sessionId=${sessionId} tool_use name=${name} ${inputPreview(input)}`
          );
        } else if (b.type === "text") {
          const text = b.text ?? "";
          if (text.length > 0) {
            activities.push({
              type: "text",
              summary: text.slice(0, 80),
              timestamp: now
            });
            onDebug(
              `[bridge:activity] sessionId=${sessionId} text "${text.slice(0, 100)}"`
            );
          }
        }
      }
      break;
    }
    case "result": {
      const subtype = msg.subtype;
      if (subtype === "success") {
        activities.push({
          type: "result",
          summary: "Session completed",
          timestamp: now
        });
        onDebug(
          `[bridge:activity] sessionId=${sessionId} result subtype=success`
        );
      } else if (subtype) {
        const errors = msg.errors;
        const errorSummary = errors?.[0] ?? `Error: ${subtype}`;
        activities.push({
          type: "error",
          summary: errorSummary,
          timestamp: now
        });
        onDebug(
          `[bridge:activity] sessionId=${sessionId} result subtype=${subtype} error="${errorSummary}"`
        );
      } else {
        onDebug(
          `[bridge:activity] sessionId=${sessionId} result subtype=undefined`
        );
      }
      break;
    }
    default:
      break;
  }
  return activities;
}
function extractUserMessageText(msg) {
  if (msg.parent_tool_use_id != null || msg.isSynthetic || msg.isReplay)
    return void 0;
  const message = msg.message;
  const content = message?.content;
  let text;
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (block && typeof block === "object" && block.type === "text") {
        text = block.text;
        break;
      }
    }
  }
  text = text?.trim();
  return text ? text : void 0;
}
function inputPreview(input) {
  const parts = [];
  for (const [key, val] of Object.entries(input)) {
    if (typeof val === "string") {
      parts.push(`${key}="${val.slice(0, 100)}"`);
    }
    if (parts.length >= 3) break;
  }
  return parts.join(" ");
}
function createSessionSpawner(deps) {
  return {
    spawn(opts, dir) {
      const safeId = safeFilenameId(opts.sessionId);
      let debugFile;
      if (deps.debugFile) {
        const ext = deps.debugFile.lastIndexOf(".");
        if (ext > 0) {
          debugFile = `${deps.debugFile.slice(0, ext)}-${safeId}${deps.debugFile.slice(ext)}`;
        } else {
          debugFile = `${deps.debugFile}-${safeId}`;
        }
      } else if (deps.verbose || process.env.USER_TYPE === "ant") {
        debugFile = join(tmpdir(), "claude", `bridge-session-${safeId}.log`);
      }
      let transcriptStream = null;
      let transcriptPath;
      if (deps.debugFile) {
        transcriptPath = join(
          dirname(deps.debugFile),
          `bridge-transcript-${safeId}.jsonl`
        );
        transcriptStream = createWriteStream(transcriptPath, { flags: "a" });
        transcriptStream.on("error", (err) => {
          deps.onDebug(
            `[bridge:session] Transcript write error: ${err.message}`
          );
          transcriptStream = null;
        });
        deps.onDebug(`[bridge:session] Transcript log: ${transcriptPath}`);
      }
      const args = [
        ...deps.scriptArgs,
        "--print",
        "--sdk-url",
        opts.sdkUrl,
        "--session-id",
        opts.sessionId,
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--replay-user-messages",
        ...deps.verbose ? ["--verbose"] : [],
        ...debugFile ? ["--debug-file", debugFile] : [],
        ...deps.permissionMode ? ["--permission-mode", deps.permissionMode] : []
      ];
      const env = {
        ...deps.env,
        // Strip the bridge's OAuth token so the child CC process uses
        // the session access token for inference instead.
        CLAUDE_CODE_OAUTH_TOKEN: void 0,
        CLAUDE_CODE_ENVIRONMENT_KIND: "bridge",
        ...deps.sandbox && { CLAUDE_CODE_FORCE_SANDBOX: "1" },
        CLAUDE_CODE_SESSION_ACCESS_TOKEN: opts.accessToken,
        // v1: HybridTransport (WS reads + POST writes) to Session-Ingress.
        // Harmless in v2 mode — transportUtils checks CLAUDE_CODE_USE_CCR_V2 first.
        CLAUDE_CODE_POST_FOR_SESSION_INGRESS_V2: "1",
        // v2: SSETransport + CCRClient to CCR's /v1/code/sessions/* endpoints.
        // Same env vars environment-manager sets in the container path.
        ...opts.useCcrV2 && {
          CLAUDE_CODE_USE_CCR_V2: "1",
          CLAUDE_CODE_WORKER_EPOCH: String(opts.workerEpoch)
        }
      };
      deps.onDebug(
        `[bridge:session] Spawning sessionId=${opts.sessionId} sdkUrl=${opts.sdkUrl} accessToken=${opts.accessToken ? "present" : "MISSING"}`
      );
      deps.onDebug(`[bridge:session] Child args: ${args.join(" ")}`);
      if (debugFile) {
        deps.onDebug(`[bridge:session] Debug log: ${debugFile}`);
      }
      const child = spawn(deps.execPath, args, {
        cwd: dir,
        stdio: ["pipe", "pipe", "pipe"],
        env,
        windowsHide: true
      });
      deps.onDebug(
        `[bridge:session] sessionId=${opts.sessionId} pid=${child.pid}`
      );
      const activities = [];
      let currentActivity = null;
      const lastStderr = [];
      let sigkillSent = false;
      let firstUserMessageSeen = false;
      if (child.stderr) {
        const stderrRl = createInterface({ input: child.stderr });
        stderrRl.on("line", (line) => {
          if (deps.verbose) {
            process.stderr.write(line + "\n");
          }
          if (lastStderr.length >= MAX_STDERR_LINES) {
            lastStderr.shift();
          }
          lastStderr.push(line);
        });
      }
      if (child.stdout) {
        const rl = createInterface({ input: child.stdout });
        rl.on("line", (line) => {
          if (transcriptStream) {
            transcriptStream.write(line + "\n");
          }
          deps.onDebug(
            `[bridge:ws] sessionId=${opts.sessionId} <<< ${debugTruncate(line)}`
          );
          if (deps.verbose) {
            process.stderr.write(line + "\n");
          }
          const extracted = extractActivities(
            line,
            opts.sessionId,
            deps.onDebug
          );
          for (const activity of extracted) {
            if (activities.length >= MAX_ACTIVITIES) {
              activities.shift();
            }
            activities.push(activity);
            currentActivity = activity;
            deps.onActivity?.(opts.sessionId, activity);
          }
          {
            let parsed;
            try {
              parsed = jsonParse(line);
            } catch {
            }
            if (parsed && typeof parsed === "object") {
              const msg = parsed;
              if (msg.type === "control_request") {
                const request = msg.request;
                if (request?.subtype === "can_use_tool" && deps.onPermissionRequest) {
                  deps.onPermissionRequest(
                    opts.sessionId,
                    parsed,
                    opts.accessToken
                  );
                }
              } else if (msg.type === "user" && !firstUserMessageSeen && opts.onFirstUserMessage) {
                const text = extractUserMessageText(msg);
                if (text) {
                  firstUserMessageSeen = true;
                  opts.onFirstUserMessage(text);
                }
              }
            }
          }
        });
      }
      const done = new Promise((resolve) => {
        child.on("close", (code, signal) => {
          if (transcriptStream) {
            transcriptStream.end();
            transcriptStream = null;
          }
          if (signal === "SIGTERM" || signal === "SIGINT") {
            deps.onDebug(
              `[bridge:session] sessionId=${opts.sessionId} interrupted signal=${signal} pid=${child.pid}`
            );
            resolve("interrupted");
          } else if (code === 0) {
            deps.onDebug(
              `[bridge:session] sessionId=${opts.sessionId} completed exit_code=0 pid=${child.pid}`
            );
            resolve("completed");
          } else {
            deps.onDebug(
              `[bridge:session] sessionId=${opts.sessionId} failed exit_code=${code} pid=${child.pid}`
            );
            resolve("failed");
          }
        });
        child.on("error", (err) => {
          deps.onDebug(
            `[bridge:session] sessionId=${opts.sessionId} spawn error: ${err.message}`
          );
          resolve("failed");
        });
      });
      const handle = {
        sessionId: opts.sessionId,
        done,
        activities,
        accessToken: opts.accessToken,
        lastStderr,
        get currentActivity() {
          return currentActivity;
        },
        kill() {
          if (!child.killed) {
            deps.onDebug(
              `[bridge:session] Sending SIGTERM to sessionId=${opts.sessionId} pid=${child.pid}`
            );
            if (process.platform === "win32") {
              child.kill();
            } else {
              child.kill("SIGTERM");
            }
          }
        },
        forceKill() {
          if (!sigkillSent && child.pid) {
            sigkillSent = true;
            deps.onDebug(
              `[bridge:session] Sending SIGKILL to sessionId=${opts.sessionId} pid=${child.pid}`
            );
            if (process.platform === "win32") {
              child.kill();
            } else {
              child.kill("SIGKILL");
            }
          }
        },
        writeStdin(data) {
          if (child.stdin && !child.stdin.destroyed) {
            deps.onDebug(
              `[bridge:ws] sessionId=${opts.sessionId} >>> ${debugTruncate(data)}`
            );
            child.stdin.write(data);
          }
        },
        updateAccessToken(token) {
          handle.accessToken = token;
          handle.writeStdin(
            jsonStringify({
              type: "update_environment_variables",
              variables: { CLAUDE_CODE_SESSION_ACCESS_TOKEN: token }
            }) + "\n"
          );
          deps.onDebug(
            `[bridge:session] Sent token refresh via stdin for sessionId=${opts.sessionId}`
          );
        }
      };
      return handle;
    }
  };
}
export {
  extractActivities as _extractActivitiesForTesting,
  createSessionSpawner,
  safeFilenameId
};
