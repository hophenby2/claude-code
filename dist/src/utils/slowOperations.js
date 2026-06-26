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
const feature = (_name) => false;
import {
  closeSync,
  writeFileSync as fsWriteFileSync,
  fsyncSync,
  openSync
} from "fs";
import lodashCloneDeep from "lodash-es/cloneDeep.js";
import { addSlowOperation } from "../bootstrap/state.js";
import { logForDebugging } from "./debug.js";
const SLOW_OPERATION_THRESHOLD_MS = (() => {
  const envValue = process.env.CLAUDE_CODE_SLOW_OPERATION_THRESHOLD_MS;
  if (envValue !== void 0) {
    const parsed = Number(envValue);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  if (process.env.NODE_ENV === "development") {
    return 20;
  }
  if (process.env.USER_TYPE === "ant") {
    return 300;
  }
  return Infinity;
})();
let isLogging = false;
function callerFrame(stack) {
  if (!stack) return "";
  for (const line of stack.split("\n")) {
    if (line.includes("slowOperations")) continue;
    const m = line.match(/([^/\\]+?):(\d+):\d+\)?$/);
    if (m) return ` @ ${m[1]}:${m[2]}`;
  }
  return "";
}
function buildDescription(args) {
  const strings = args[0];
  let result = "";
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i + 1 < args.length) {
      const v = args[i + 1];
      if (Array.isArray(v)) {
        result += `Array[${v.length}]`;
      } else if (v !== null && typeof v === "object") {
        result += `Object{${Object.keys(v).length} keys}`;
      } else if (typeof v === "string") {
        result += v.length > 80 ? `${v.slice(0, 80)}\u2026` : v;
      } else {
        result += String(v);
      }
    }
  }
  return result;
}
class AntSlowLogger {
  startTime;
  args;
  err;
  constructor(args) {
    this.startTime = performance.now();
    this.args = args;
    this.err = new Error();
  }
  [Symbol.dispose]() {
    const duration = performance.now() - this.startTime;
    if (duration > SLOW_OPERATION_THRESHOLD_MS && !isLogging) {
      isLogging = true;
      try {
        const description = buildDescription(this.args) + callerFrame(this.err.stack);
        logForDebugging(
          `[SLOW OPERATION DETECTED] ${description} (${duration.toFixed(1)}ms)`
        );
        addSlowOperation(description, duration);
      } finally {
        isLogging = false;
      }
    }
  }
}
const NOOP_LOGGER = { [Symbol.dispose]() {
} };
function slowLoggingAnt(_strings, ..._values) {
  return new AntSlowLogger(arguments);
}
function slowLoggingExternal() {
  return NOOP_LOGGER;
}
const slowLogging = false ? slowLoggingAnt : slowLoggingExternal;
function jsonStringify(value, replacer, space) {
  var _stack = [];
  try {
    const _ = __using(_stack, slowLogging`JSON.stringify(${value})`);
    return JSON.stringify(
      value,
      replacer,
      space
    );
  } catch (_2) {
    var _error = _2, _hasError = true;
  } finally {
    __callDispose(_stack, _error, _hasError);
  }
}
const jsonParse = (text, reviver) => {
  var _stack = [];
  try {
    const _ = __using(_stack, slowLogging`JSON.parse(${text})`);
    return typeof reviver === "undefined" ? JSON.parse(text) : JSON.parse(text, reviver);
  } catch (_2) {
    var _error = _2, _hasError = true;
  } finally {
    __callDispose(_stack, _error, _hasError);
  }
};
function clone(value, options) {
  var _stack = [];
  try {
    const _ = __using(_stack, slowLogging`structuredClone(${value})`);
    return structuredClone(value, options);
  } catch (_2) {
    var _error = _2, _hasError = true;
  } finally {
    __callDispose(_stack, _error, _hasError);
  }
}
function cloneDeep(value) {
  var _stack = [];
  try {
    const _ = __using(_stack, slowLogging`cloneDeep(${value})`);
    return lodashCloneDeep(value);
  } catch (_2) {
    var _error = _2, _hasError = true;
  } finally {
    __callDispose(_stack, _error, _hasError);
  }
}
function writeFileSync_DEPRECATED(filePath, data, options) {
  var _stack = [];
  try {
    const _ = __using(_stack, slowLogging`fs.writeFileSync(${filePath}, ${data})`);
    const needsFlush = options !== null && typeof options === "object" && "flush" in options && options.flush === true;
    if (needsFlush) {
      const encoding = typeof options === "object" && "encoding" in options ? options.encoding : void 0;
      const mode = typeof options === "object" && "mode" in options ? options.mode : void 0;
      let fd;
      try {
        fd = openSync(filePath, "w", mode);
        fsWriteFileSync(fd, data, { encoding: encoding ?? void 0 });
        fsyncSync(fd);
      } finally {
        if (fd !== void 0) {
          closeSync(fd);
        }
      }
    } else {
      fsWriteFileSync(filePath, data, options);
    }
  } catch (_2) {
    var _error = _2, _hasError = true;
  } finally {
    __callDispose(_stack, _error, _hasError);
  }
}
export {
  SLOW_OPERATION_THRESHOLD_MS,
  callerFrame,
  clone,
  cloneDeep,
  jsonParse,
  jsonStringify,
  slowLogging,
  writeFileSync_DEPRECATED
};
