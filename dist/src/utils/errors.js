import { APIUserAbortError } from "@anthropic-ai/sdk";
class ClaudeError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}
class MalformedCommandError extends Error {
}
class AbortError extends Error {
  constructor(message) {
    super(message);
    this.name = "AbortError";
  }
}
function isAbortError(e) {
  return e instanceof AbortError || e instanceof APIUserAbortError || e instanceof Error && e.name === "AbortError";
}
class ConfigParseError extends Error {
  filePath;
  defaultConfig;
  constructor(message, filePath, defaultConfig) {
    super(message);
    this.name = "ConfigParseError";
    this.filePath = filePath;
    this.defaultConfig = defaultConfig;
  }
}
class ShellError extends Error {
  constructor(stdout, stderr, code, interrupted) {
    super("Shell command failed");
    this.stdout = stdout;
    this.stderr = stderr;
    this.code = code;
    this.interrupted = interrupted;
    this.name = "ShellError";
  }
  stdout;
  stderr;
  code;
  interrupted;
}
class TeleportOperationError extends Error {
  constructor(message, formattedMessage) {
    super(message);
    this.formattedMessage = formattedMessage;
    this.name = "TeleportOperationError";
  }
  formattedMessage;
}
class TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS extends Error {
  telemetryMessage;
  constructor(message, telemetryMessage) {
    super(message);
    this.name = "TelemetrySafeError";
    this.telemetryMessage = telemetryMessage ?? message;
  }
}
function hasExactErrorMessage(error, message) {
  return error instanceof Error && error.message === message;
}
function toError(e) {
  return e instanceof Error ? e : new Error(String(e));
}
function errorMessage(e) {
  return e instanceof Error ? e.message : String(e);
}
function getErrnoCode(e) {
  if (e && typeof e === "object" && "code" in e && typeof e.code === "string") {
    return e.code;
  }
  return void 0;
}
function isENOENT(e) {
  return getErrnoCode(e) === "ENOENT";
}
function getErrnoPath(e) {
  if (e && typeof e === "object" && "path" in e && typeof e.path === "string") {
    return e.path;
  }
  return void 0;
}
function shortErrorStack(e, maxFrames = 5) {
  if (!(e instanceof Error)) return String(e);
  if (!e.stack) return e.message;
  const lines = e.stack.split("\n");
  const header = lines[0] ?? e.message;
  const frames = lines.slice(1).filter((l) => l.trim().startsWith("at "));
  if (frames.length <= maxFrames) return e.stack;
  return [header, ...frames.slice(0, maxFrames)].join("\n");
}
function isFsInaccessible(e) {
  const code = getErrnoCode(e);
  return code === "ENOENT" || code === "EACCES" || code === "EPERM" || code === "ENOTDIR" || code === "ELOOP";
}
function classifyAxiosError(e) {
  const message = errorMessage(e);
  if (!e || typeof e !== "object" || !("isAxiosError" in e) || !e.isAxiosError) {
    return { kind: "other", message };
  }
  const err = e;
  const status = err.response?.status;
  if (status === 401 || status === 403) return { kind: "auth", status, message };
  if (err.code === "ECONNABORTED") return { kind: "timeout", status, message };
  if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
    return { kind: "network", status, message };
  }
  return { kind: "http", status, message };
}
export {
  AbortError,
  ClaudeError,
  ConfigParseError,
  MalformedCommandError,
  ShellError,
  TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  TeleportOperationError,
  classifyAxiosError,
  errorMessage,
  getErrnoCode,
  getErrnoPath,
  hasExactErrorMessage,
  isAbortError,
  isENOENT,
  isFsInaccessible,
  shortErrorStack,
  toError
};
