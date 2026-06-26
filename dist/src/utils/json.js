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
import { open, readFile, stat } from "fs/promises";
import {
  applyEdits,
  modify,
  parse as parseJsonc
} from "jsonc-parser";
import { stripBOM } from "./jsonRead.js";
import { logError } from "./log.js";
import { memoizeWithLRU } from "./memoize.js";
import { jsonStringify } from "./slowOperations.js";
const PARSE_CACHE_MAX_KEY_BYTES = 8 * 1024;
function parseJSONUncached(json, shouldLogError) {
  try {
    return { ok: true, value: JSON.parse(stripBOM(json)) };
  } catch (e) {
    if (shouldLogError) {
      logError(e);
    }
    return { ok: false };
  }
}
const parseJSONCached = memoizeWithLRU(parseJSONUncached, (json) => json, 50);
const safeParseJSON = Object.assign(
  function safeParseJSON2(json, shouldLogError = true) {
    if (!json) return null;
    const result = json.length > PARSE_CACHE_MAX_KEY_BYTES ? parseJSONUncached(json, shouldLogError) : parseJSONCached(json, shouldLogError);
    return result.ok ? result.value : null;
  },
  { cache: parseJSONCached.cache }
);
function safeParseJSONC(json) {
  if (!json) {
    return null;
  }
  try {
    return parseJsonc(stripBOM(json));
  } catch (e) {
    logError(e);
    return null;
  }
}
const bunJSONLParse = (() => {
  if (typeof Bun === "undefined") return false;
  const b = Bun;
  const jsonl = b.JSONL;
  if (!jsonl?.parseChunk) return false;
  return jsonl.parseChunk;
})();
function parseJSONLBun(data) {
  const parse = bunJSONLParse;
  const len = data.length;
  const result = parse(data);
  if (!result.error || result.done || result.read >= len) {
    return result.values;
  }
  let values = result.values;
  let offset = result.read;
  while (offset < len) {
    const newlineIndex = typeof data === "string" ? data.indexOf("\n", offset) : data.indexOf(10, offset);
    if (newlineIndex === -1) break;
    offset = newlineIndex + 1;
    const next = parse(data, offset);
    if (next.values.length > 0) {
      values = values.concat(next.values);
    }
    if (!next.error || next.done || next.read >= len) break;
    offset = next.read;
  }
  return values;
}
function parseJSONLBuffer(buf) {
  const bufLen = buf.length;
  let start = 0;
  if (buf[0] === 239 && buf[1] === 187 && buf[2] === 191) {
    start = 3;
  }
  const results = [];
  while (start < bufLen) {
    let end = buf.indexOf(10, start);
    if (end === -1) end = bufLen;
    const line = buf.toString("utf8", start, end).trim();
    start = end + 1;
    if (!line) continue;
    try {
      results.push(JSON.parse(line));
    } catch {
    }
  }
  return results;
}
function parseJSONLString(data) {
  const stripped = stripBOM(data);
  const len = stripped.length;
  let start = 0;
  const results = [];
  while (start < len) {
    let end = stripped.indexOf("\n", start);
    if (end === -1) end = len;
    const line = stripped.substring(start, end).trim();
    start = end + 1;
    if (!line) continue;
    try {
      results.push(JSON.parse(line));
    } catch {
    }
  }
  return results;
}
function parseJSONL(data) {
  if (bunJSONLParse) {
    return parseJSONLBun(data);
  }
  if (typeof data === "string") {
    return parseJSONLString(data);
  }
  return parseJSONLBuffer(data);
}
const MAX_JSONL_READ_BYTES = 100 * 1024 * 1024;
async function readJSONLFile(filePath) {
  var _stack = [];
  try {
    const { size } = await stat(filePath);
    if (size <= MAX_JSONL_READ_BYTES) {
      return parseJSONL(await readFile(filePath));
    }
    const fd = __using(_stack, await open(filePath, "r"), true);
    const buf = Buffer.allocUnsafe(MAX_JSONL_READ_BYTES);
    let totalRead = 0;
    const fileOffset = size - MAX_JSONL_READ_BYTES;
    while (totalRead < MAX_JSONL_READ_BYTES) {
      const { bytesRead } = await fd.read(
        buf,
        totalRead,
        MAX_JSONL_READ_BYTES - totalRead,
        fileOffset + totalRead
      );
      if (bytesRead === 0) break;
      totalRead += bytesRead;
    }
    const newlineIndex = buf.indexOf(10);
    if (newlineIndex !== -1 && newlineIndex < totalRead - 1) {
      return parseJSONL(buf.subarray(newlineIndex + 1, totalRead));
    }
    return parseJSONL(buf.subarray(0, totalRead));
  } catch (_) {
    var _error = _, _hasError = true;
  } finally {
    var _promise = __callDispose(_stack, _error, _hasError);
    _promise && await _promise;
  }
}
function addItemToJSONCArray(content, newItem) {
  try {
    if (!content || content.trim() === "") {
      return jsonStringify([newItem], null, 4);
    }
    const cleanContent = stripBOM(content);
    const parsedContent = parseJsonc(cleanContent);
    if (Array.isArray(parsedContent)) {
      const arrayLength = parsedContent.length;
      const isEmpty = arrayLength === 0;
      const insertPath = isEmpty ? [0] : [arrayLength];
      const edits = modify(cleanContent, insertPath, newItem, {
        formattingOptions: { insertSpaces: true, tabSize: 4 },
        isArrayInsertion: true
      });
      if (!edits || edits.length === 0) {
        const copy = [...parsedContent, newItem];
        return jsonStringify(copy, null, 4);
      }
      return applyEdits(cleanContent, edits);
    } else {
      return jsonStringify([newItem], null, 4);
    }
  } catch (e) {
    logError(e);
    return jsonStringify([newItem], null, 4);
  }
}
export {
  addItemToJSONCArray,
  parseJSONL,
  readJSONLFile,
  safeParseJSON,
  safeParseJSONC
};
