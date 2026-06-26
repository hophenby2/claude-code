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
import * as fs from "fs";
import {
  mkdir as mkdirPromise,
  open,
  readdir as readdirPromise,
  readFile as readFilePromise,
  rename as renamePromise,
  rmdir as rmdirPromise,
  rm as rmPromise,
  stat as statPromise,
  unlink as unlinkPromise
} from "fs/promises";
import { homedir } from "os";
import * as nodePath from "path";
import { getErrnoCode } from "./errors.js";
import { slowLogging } from "./slowOperations.js";
function safeResolvePath(fs2, filePath) {
  if (filePath.startsWith("//") || filePath.startsWith("\\\\")) {
    return { resolvedPath: filePath, isSymlink: false, isCanonical: false };
  }
  try {
    const stats = fs2.lstatSync(filePath);
    if (stats.isFIFO() || stats.isSocket() || stats.isCharacterDevice() || stats.isBlockDevice()) {
      return { resolvedPath: filePath, isSymlink: false, isCanonical: false };
    }
    const resolvedPath = fs2.realpathSync(filePath);
    return {
      resolvedPath,
      isSymlink: resolvedPath !== filePath,
      // realpathSync returned: resolvedPath is canonical (all symlinks in
      // all path components resolved). Callers can skip further symlink
      // resolution on this path.
      isCanonical: true
    };
  } catch (_error) {
    return { resolvedPath: filePath, isSymlink: false, isCanonical: false };
  }
}
function isDuplicatePath(fs2, filePath, loadedPaths) {
  const { resolvedPath } = safeResolvePath(fs2, filePath);
  if (loadedPaths.has(resolvedPath)) {
    return true;
  }
  loadedPaths.add(resolvedPath);
  return false;
}
function resolveDeepestExistingAncestorSync(fs2, absolutePath) {
  let dir = absolutePath;
  const segments = [];
  while (dir !== nodePath.dirname(dir)) {
    let st;
    try {
      st = fs2.lstatSync(dir);
    } catch {
      segments.unshift(nodePath.basename(dir));
      dir = nodePath.dirname(dir);
      continue;
    }
    if (st.isSymbolicLink()) {
      try {
        const resolved = fs2.realpathSync(dir);
        return segments.length === 0 ? resolved : nodePath.join(resolved, ...segments);
      } catch {
        const target = fs2.readlinkSync(dir);
        const absTarget = nodePath.isAbsolute(target) ? target : nodePath.resolve(nodePath.dirname(dir), target);
        return segments.length === 0 ? absTarget : nodePath.join(absTarget, ...segments);
      }
    }
    try {
      const resolved = fs2.realpathSync(dir);
      if (resolved !== dir) {
        return segments.length === 0 ? resolved : nodePath.join(resolved, ...segments);
      }
    } catch {
    }
    return void 0;
  }
  return void 0;
}
function getPathsForPermissionCheck(inputPath) {
  let path = inputPath;
  if (path === "~") {
    path = homedir().normalize("NFC");
  } else if (path.startsWith("~/")) {
    path = nodePath.join(homedir().normalize("NFC"), path.slice(2));
  }
  const pathSet = /* @__PURE__ */ new Set();
  const fsImpl = getFsImplementation();
  pathSet.add(path);
  if (path.startsWith("//") || path.startsWith("\\\\")) {
    return Array.from(pathSet);
  }
  try {
    let currentPath = path;
    const visited = /* @__PURE__ */ new Set();
    const maxDepth = 40;
    for (let depth = 0; depth < maxDepth; depth++) {
      if (visited.has(currentPath)) {
        break;
      }
      visited.add(currentPath);
      if (!fsImpl.existsSync(currentPath)) {
        if (currentPath === path) {
          const resolved = resolveDeepestExistingAncestorSync(fsImpl, path);
          if (resolved !== void 0) {
            pathSet.add(resolved);
          }
        }
        break;
      }
      const stats = fsImpl.lstatSync(currentPath);
      if (stats.isFIFO() || stats.isSocket() || stats.isCharacterDevice() || stats.isBlockDevice()) {
        break;
      }
      if (!stats.isSymbolicLink()) {
        break;
      }
      const target = fsImpl.readlinkSync(currentPath);
      const absoluteTarget = nodePath.isAbsolute(target) ? target : nodePath.resolve(nodePath.dirname(currentPath), target);
      pathSet.add(absoluteTarget);
      currentPath = absoluteTarget;
    }
  } catch {
  }
  const { resolvedPath, isSymlink } = safeResolvePath(fsImpl, path);
  if (isSymlink && resolvedPath !== path) {
    pathSet.add(resolvedPath);
  }
  return Array.from(pathSet);
}
const NodeFsOperations = {
  cwd() {
    return process.cwd();
  },
  existsSync(fsPath) {
    var _stack = [];
    try {
      const _ = __using(_stack, slowLogging`fs.existsSync(${fsPath})`);
      return fs.existsSync(fsPath);
    } catch (_2) {
      var _error = _2, _hasError = true;
    } finally {
      __callDispose(_stack, _error, _hasError);
    }
  },
  async stat(fsPath) {
    return statPromise(fsPath);
  },
  async readdir(fsPath) {
    return readdirPromise(fsPath, { withFileTypes: true });
  },
  async unlink(fsPath) {
    return unlinkPromise(fsPath);
  },
  async rmdir(fsPath) {
    return rmdirPromise(fsPath);
  },
  async rm(fsPath, options) {
    return rmPromise(fsPath, options);
  },
  async mkdir(dirPath, options) {
    try {
      await mkdirPromise(dirPath, { recursive: true, ...options });
    } catch (e) {
      if (getErrnoCode(e) !== "EEXIST") throw e;
    }
  },
  async readFile(fsPath, options) {
    return readFilePromise(fsPath, { encoding: options.encoding });
  },
  async rename(oldPath, newPath) {
    return renamePromise(oldPath, newPath);
  },
  statSync(fsPath) {
    var _stack = [];
    try {
      const _ = __using(_stack, slowLogging`fs.statSync(${fsPath})`);
      return fs.statSync(fsPath);
    } catch (_2) {
      var _error = _2, _hasError = true;
    } finally {
      __callDispose(_stack, _error, _hasError);
    }
  },
  lstatSync(fsPath) {
    var _stack = [];
    try {
      const _ = __using(_stack, slowLogging`fs.lstatSync(${fsPath})`);
      return fs.lstatSync(fsPath);
    } catch (_2) {
      var _error = _2, _hasError = true;
    } finally {
      __callDispose(_stack, _error, _hasError);
    }
  },
  readFileSync(fsPath, options) {
    var _stack = [];
    try {
      const _ = __using(_stack, slowLogging`fs.readFileSync(${fsPath})`);
      return fs.readFileSync(fsPath, { encoding: options.encoding });
    } catch (_2) {
      var _error = _2, _hasError = true;
    } finally {
      __callDispose(_stack, _error, _hasError);
    }
  },
  readFileBytesSync(fsPath) {
    var _stack = [];
    try {
      const _ = __using(_stack, slowLogging`fs.readFileBytesSync(${fsPath})`);
      return fs.readFileSync(fsPath);
    } catch (_2) {
      var _error = _2, _hasError = true;
    } finally {
      __callDispose(_stack, _error, _hasError);
    }
  },
  readSync(fsPath, options) {
    var _stack = [];
    try {
      const _ = __using(_stack, slowLogging`fs.readSync(${fsPath}, ${options.length} bytes)`);
      let fd = void 0;
      try {
        fd = fs.openSync(fsPath, "r");
        const buffer = Buffer.alloc(options.length);
        const bytesRead = fs.readSync(fd, buffer, 0, options.length, 0);
        return { buffer, bytesRead };
      } finally {
        if (fd) fs.closeSync(fd);
      }
    } catch (_2) {
      var _error = _2, _hasError = true;
    } finally {
      __callDispose(_stack, _error, _hasError);
    }
  },
  appendFileSync(path, data, options) {
    var _stack = [];
    try {
      const _ = __using(_stack, slowLogging`fs.appendFileSync(${path}, ${data.length} chars)`);
      if (options?.mode !== void 0) {
        try {
          const fd = fs.openSync(path, "ax", options.mode);
          try {
            fs.appendFileSync(fd, data);
          } finally {
            fs.closeSync(fd);
          }
          return;
        } catch (e) {
          if (getErrnoCode(e) !== "EEXIST") throw e;
        }
      }
      fs.appendFileSync(path, data);
    } catch (_2) {
      var _error = _2, _hasError = true;
    } finally {
      __callDispose(_stack, _error, _hasError);
    }
  },
  copyFileSync(src, dest) {
    var _stack = [];
    try {
      const _ = __using(_stack, slowLogging`fs.copyFileSync(${src} → ${dest})`);
      fs.copyFileSync(src, dest);
    } catch (_2) {
      var _error = _2, _hasError = true;
    } finally {
      __callDispose(_stack, _error, _hasError);
    }
  },
  unlinkSync(path) {
    var _stack = [];
    try {
      const _ = __using(_stack, slowLogging`fs.unlinkSync(${path})`);
      fs.unlinkSync(path);
    } catch (_2) {
      var _error = _2, _hasError = true;
    } finally {
      __callDispose(_stack, _error, _hasError);
    }
  },
  renameSync(oldPath, newPath) {
    var _stack = [];
    try {
      const _ = __using(_stack, slowLogging`fs.renameSync(${oldPath} → ${newPath})`);
      fs.renameSync(oldPath, newPath);
    } catch (_2) {
      var _error = _2, _hasError = true;
    } finally {
      __callDispose(_stack, _error, _hasError);
    }
  },
  linkSync(target, path) {
    var _stack = [];
    try {
      const _ = __using(_stack, slowLogging`fs.linkSync(${target} → ${path})`);
      fs.linkSync(target, path);
    } catch (_2) {
      var _error = _2, _hasError = true;
    } finally {
      __callDispose(_stack, _error, _hasError);
    }
  },
  symlinkSync(target, path, type) {
    var _stack = [];
    try {
      const _ = __using(_stack, slowLogging`fs.symlinkSync(${target} → ${path})`);
      fs.symlinkSync(target, path, type);
    } catch (_2) {
      var _error = _2, _hasError = true;
    } finally {
      __callDispose(_stack, _error, _hasError);
    }
  },
  readlinkSync(path) {
    var _stack = [];
    try {
      const _ = __using(_stack, slowLogging`fs.readlinkSync(${path})`);
      return fs.readlinkSync(path);
    } catch (_2) {
      var _error = _2, _hasError = true;
    } finally {
      __callDispose(_stack, _error, _hasError);
    }
  },
  realpathSync(path) {
    var _stack = [];
    try {
      const _ = __using(_stack, slowLogging`fs.realpathSync(${path})`);
      return fs.realpathSync(path).normalize("NFC");
    } catch (_2) {
      var _error = _2, _hasError = true;
    } finally {
      __callDispose(_stack, _error, _hasError);
    }
  },
  mkdirSync(dirPath, options) {
    var _stack = [];
    try {
      const _ = __using(_stack, slowLogging`fs.mkdirSync(${dirPath})`);
      const mkdirOptions = {
        recursive: true
      };
      if (options?.mode !== void 0) {
        mkdirOptions.mode = options.mode;
      }
      try {
        fs.mkdirSync(dirPath, mkdirOptions);
      } catch (e) {
        if (getErrnoCode(e) !== "EEXIST") throw e;
      }
    } catch (_2) {
      var _error = _2, _hasError = true;
    } finally {
      __callDispose(_stack, _error, _hasError);
    }
  },
  readdirSync(dirPath) {
    var _stack = [];
    try {
      const _ = __using(_stack, slowLogging`fs.readdirSync(${dirPath})`);
      return fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (_2) {
      var _error = _2, _hasError = true;
    } finally {
      __callDispose(_stack, _error, _hasError);
    }
  },
  readdirStringSync(dirPath) {
    var _stack = [];
    try {
      const _ = __using(_stack, slowLogging`fs.readdirStringSync(${dirPath})`);
      return fs.readdirSync(dirPath);
    } catch (_2) {
      var _error = _2, _hasError = true;
    } finally {
      __callDispose(_stack, _error, _hasError);
    }
  },
  isDirEmptySync(dirPath) {
    var _stack = [];
    try {
      const _ = __using(_stack, slowLogging`fs.isDirEmptySync(${dirPath})`);
      const files = this.readdirSync(dirPath);
      return files.length === 0;
    } catch (_2) {
      var _error = _2, _hasError = true;
    } finally {
      __callDispose(_stack, _error, _hasError);
    }
  },
  rmdirSync(dirPath) {
    var _stack = [];
    try {
      const _ = __using(_stack, slowLogging`fs.rmdirSync(${dirPath})`);
      fs.rmdirSync(dirPath);
    } catch (_2) {
      var _error = _2, _hasError = true;
    } finally {
      __callDispose(_stack, _error, _hasError);
    }
  },
  rmSync(path, options) {
    var _stack = [];
    try {
      const _ = __using(_stack, slowLogging`fs.rmSync(${path})`);
      fs.rmSync(path, options);
    } catch (_2) {
      var _error = _2, _hasError = true;
    } finally {
      __callDispose(_stack, _error, _hasError);
    }
  },
  createWriteStream(path) {
    return fs.createWriteStream(path);
  },
  async readFileBytes(fsPath, maxBytes) {
    if (maxBytes === void 0) {
      return readFilePromise(fsPath);
    }
    const handle = await open(fsPath, "r");
    try {
      const { size } = await handle.stat();
      const readSize = Math.min(size, maxBytes);
      const buffer = Buffer.allocUnsafe(readSize);
      let offset = 0;
      while (offset < readSize) {
        const { bytesRead } = await handle.read(
          buffer,
          offset,
          readSize - offset,
          offset
        );
        if (bytesRead === 0) break;
        offset += bytesRead;
      }
      return offset < readSize ? buffer.subarray(0, offset) : buffer;
    } finally {
      await handle.close();
    }
  }
};
let activeFs = NodeFsOperations;
function setFsImplementation(implementation) {
  activeFs = implementation;
}
function getFsImplementation() {
  return activeFs;
}
function setOriginalFsImplementation() {
  activeFs = NodeFsOperations;
}
async function readFileRange(path, offset, maxBytes) {
  var _stack = [];
  try {
    const fh = __using(_stack, await open(path, "r"), true);
    const size = (await fh.stat()).size;
    if (size <= offset) {
      return null;
    }
    const bytesToRead = Math.min(size - offset, maxBytes);
    const buffer = Buffer.allocUnsafe(bytesToRead);
    let totalRead = 0;
    while (totalRead < bytesToRead) {
      const { bytesRead } = await fh.read(
        buffer,
        totalRead,
        bytesToRead - totalRead,
        offset + totalRead
      );
      if (bytesRead === 0) {
        break;
      }
      totalRead += bytesRead;
    }
    return {
      content: buffer.toString("utf8", 0, totalRead),
      bytesRead: totalRead,
      bytesTotal: size
    };
  } catch (_) {
    var _error = _, _hasError = true;
  } finally {
    var _promise = __callDispose(_stack, _error, _hasError);
    _promise && await _promise;
  }
}
async function tailFile(path, maxBytes) {
  var _stack = [];
  try {
    const fh = __using(_stack, await open(path, "r"), true);
    const size = (await fh.stat()).size;
    if (size === 0) {
      return { content: "", bytesRead: 0, bytesTotal: 0 };
    }
    const offset = Math.max(0, size - maxBytes);
    const bytesToRead = size - offset;
    const buffer = Buffer.allocUnsafe(bytesToRead);
    let totalRead = 0;
    while (totalRead < bytesToRead) {
      const { bytesRead } = await fh.read(
        buffer,
        totalRead,
        bytesToRead - totalRead,
        offset + totalRead
      );
      if (bytesRead === 0) {
        break;
      }
      totalRead += bytesRead;
    }
    return {
      content: buffer.toString("utf8", 0, totalRead),
      bytesRead: totalRead,
      bytesTotal: size
    };
  } catch (_) {
    var _error = _, _hasError = true;
  } finally {
    var _promise = __callDispose(_stack, _error, _hasError);
    _promise && await _promise;
  }
}
async function* readLinesReverse(path) {
  const CHUNK_SIZE = 1024 * 4;
  const fileHandle = await open(path, "r");
  try {
    const stats = await fileHandle.stat();
    let position = stats.size;
    let remainder = Buffer.alloc(0);
    const buffer = Buffer.alloc(CHUNK_SIZE);
    while (position > 0) {
      const currentChunkSize = Math.min(CHUNK_SIZE, position);
      position -= currentChunkSize;
      await fileHandle.read(buffer, 0, currentChunkSize, position);
      const combined = Buffer.concat([
        buffer.subarray(0, currentChunkSize),
        remainder
      ]);
      const firstNewline = combined.indexOf(10);
      if (firstNewline === -1) {
        remainder = combined;
        continue;
      }
      remainder = Buffer.from(combined.subarray(0, firstNewline));
      const lines = combined.toString("utf8", firstNewline + 1).split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (line) {
          yield line;
        }
      }
    }
    if (remainder.length > 0) {
      yield remainder.toString("utf8");
    }
  } finally {
    await fileHandle.close();
  }
}
export {
  NodeFsOperations,
  getFsImplementation,
  getPathsForPermissionCheck,
  isDuplicatePath,
  readFileRange,
  readLinesReverse,
  resolveDeepestExistingAncestorSync,
  safeResolvePath,
  setFsImplementation,
  setOriginalFsImplementation,
  tailFile
};
