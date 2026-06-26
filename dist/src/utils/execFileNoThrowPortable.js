var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : /* @__PURE__ */ Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __using = (stack, value, async) => {
  if (value != null) {
    if (typeof value !== "object" && typeof value !== "function") __typeError("Object expected");
    var dispose, inner;
    if (async) dispose = value[__knownSymbol("asyncDispose")];
    if (dispose === void 0) {
      dispose = value[__knownSymbol("dispose")];
      if (async) inner = dispose;
    }
    if (typeof dispose !== "function") __typeError("Object not disposable");
    if (inner) dispose = function() {
      try {
        inner.call(this);
      } catch (e) {
        return Promise.reject(e);
      }
    };
    stack.push([async, dispose, value]);
  } else if (async) {
    stack.push([async]);
  }
  return value;
};
var __callDispose = (stack, error, hasError) => {
  var E = typeof SuppressedError === "function" ? SuppressedError : function(e, s, m, _) {
    return _ = Error(m), _.name = "SuppressedError", _.error = e, _.suppressed = s, _;
  };
  var fail = (e) => error = hasError ? new E(e, error, "An error was suppressed during disposal") : (hasError = true, e);
  var next = (it) => {
    while (it = stack.pop()) {
      try {
        var result = it[1] && it[1].call(it[2]);
        if (it[0]) return Promise.resolve(result).then(next, (e) => (fail(e), next()));
      } catch (e) {
        fail(e);
      }
    }
    if (hasError) throw error;
  };
  return next();
};
import { execaSync } from "execa";
import { getCwd } from "../utils/cwd.js";
import { slowLogging } from "./slowOperations.js";
const MS_IN_SECOND = 1e3;
const SECONDS_IN_MINUTE = 60;
function execSyncWithDefaults_DEPRECATED(command, optionsOrAbortSignal, timeout = 10 * SECONDS_IN_MINUTE * MS_IN_SECOND) {
  var _stack = [];
  try {
    let options;
    if (optionsOrAbortSignal === void 0) {
      options = {};
    } else if (optionsOrAbortSignal instanceof AbortSignal) {
      options = {
        abortSignal: optionsOrAbortSignal,
        timeout
      };
    } else {
      options = optionsOrAbortSignal;
    }
    const {
      abortSignal,
      timeout: finalTimeout = 10 * SECONDS_IN_MINUTE * MS_IN_SECOND,
      input,
      stdio = ["ignore", "pipe", "pipe"]
    } = options;
    abortSignal?.throwIfAborted();
    const _ = __using(_stack, slowLogging`exec: ${command.slice(0, 200)}`);
    try {
      const result = execaSync(command, {
        env: process.env,
        maxBuffer: 1e6,
        timeout: finalTimeout,
        cwd: getCwd(),
        stdio,
        shell: true,
        // execSync typically runs shell commands
        reject: false,
        // Don't throw on non-zero exit codes
        input
      });
      if (!result.stdout) {
        return null;
      }
      return result.stdout.trim() || null;
    } catch {
      return null;
    }
  } catch (_2) {
    var _error = _2, _hasError = true;
  } finally {
    __callDispose(_stack, _error, _hasError);
  }
}
export {
  execSyncWithDefaults_DEPRECATED
};
