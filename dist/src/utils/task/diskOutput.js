import { constants as fsConstants } from "fs";
import {
  mkdir,
  open,
  stat,
  symlink,
  unlink
} from "fs/promises";
import { join } from "path";
import { getSessionId } from "../../bootstrap/state.js";
import { getErrnoCode } from "../errors.js";
import { readFileRange, tailFile } from "../fsOperations.js";
import { logError } from "../log.js";
import { getProjectTempDir } from "../permissions/filesystem.js";
const O_NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0;
const DEFAULT_MAX_READ_BYTES = 8 * 1024 * 1024;
const MAX_TASK_OUTPUT_BYTES = 5 * 1024 * 1024 * 1024;
const MAX_TASK_OUTPUT_BYTES_DISPLAY = "5GB";
let _taskOutputDir;
function getTaskOutputDir() {
  if (_taskOutputDir === void 0) {
    _taskOutputDir = join(getProjectTempDir(), getSessionId(), "tasks");
  }
  return _taskOutputDir;
}
function _resetTaskOutputDirForTest() {
  _taskOutputDir = void 0;
}
async function ensureOutputDir() {
  await mkdir(getTaskOutputDir(), { recursive: true });
}
function getTaskOutputPath(taskId) {
  return join(getTaskOutputDir(), `${taskId}.output`);
}
const _pendingOps = /* @__PURE__ */ new Set();
function track(p) {
  _pendingOps.add(p);
  void p.finally(() => _pendingOps.delete(p)).catch(() => {
  });
  return p;
}
class DiskTaskOutput {
  #path;
  #fileHandle = null;
  #queue = [];
  #bytesWritten = 0;
  #capped = false;
  #flushPromise = null;
  #flushResolve = null;
  constructor(taskId) {
    this.#path = getTaskOutputPath(taskId);
  }
  append(content) {
    if (this.#capped) {
      return;
    }
    this.#bytesWritten += content.length;
    if (this.#bytesWritten > MAX_TASK_OUTPUT_BYTES) {
      this.#capped = true;
      this.#queue.push(
        `
[output truncated: exceeded ${MAX_TASK_OUTPUT_BYTES_DISPLAY} disk cap]
`
      );
    } else {
      this.#queue.push(content);
    }
    if (!this.#flushPromise) {
      this.#flushPromise = new Promise((resolve) => {
        this.#flushResolve = resolve;
      });
      void track(this.#drain());
    }
  }
  flush() {
    return this.#flushPromise ?? Promise.resolve();
  }
  cancel() {
    this.#queue.length = 0;
  }
  async #drainAllChunks() {
    while (true) {
      try {
        if (!this.#fileHandle) {
          await ensureOutputDir();
          this.#fileHandle = await open(
            this.#path,
            process.platform === "win32" ? "a" : fsConstants.O_WRONLY | fsConstants.O_APPEND | fsConstants.O_CREAT | O_NOFOLLOW
          );
        }
        while (true) {
          await this.#writeAllChunks();
          if (this.#queue.length === 0) {
            break;
          }
        }
      } finally {
        if (this.#fileHandle) {
          const fileHandle = this.#fileHandle;
          this.#fileHandle = null;
          await fileHandle.close();
        }
      }
      if (this.#queue.length) {
        continue;
      }
      break;
    }
  }
  #writeAllChunks() {
    return this.#fileHandle.appendFile(
      // This variable needs to get GC'd ASAP.
      this.#queueToBuffers()
    );
  }
  /** Keep this in a separate method so that GC doesn't keep it alive for any longer than it should. */
  #queueToBuffers() {
    const queue = this.#queue.splice(0, this.#queue.length);
    let totalLength = 0;
    for (const str of queue) {
      totalLength += Buffer.byteLength(str, "utf8");
    }
    const buffer = Buffer.allocUnsafe(totalLength);
    let offset = 0;
    for (const str of queue) {
      offset += buffer.write(str, offset, "utf8");
    }
    return buffer;
  }
  async #drain() {
    try {
      await this.#drainAllChunks();
    } catch (e) {
      logError(e);
      if (this.#queue.length > 0) {
        try {
          await this.#drainAllChunks();
        } catch (e2) {
          logError(e2);
        }
      }
    } finally {
      const resolve = this.#flushResolve;
      this.#flushPromise = null;
      this.#flushResolve = null;
      resolve();
    }
  }
}
const outputs = /* @__PURE__ */ new Map();
async function _clearOutputsForTest() {
  for (const output of outputs.values()) {
    output.cancel();
  }
  while (_pendingOps.size > 0) {
    await Promise.allSettled([..._pendingOps]);
  }
  outputs.clear();
}
function getOrCreateOutput(taskId) {
  let output = outputs.get(taskId);
  if (!output) {
    output = new DiskTaskOutput(taskId);
    outputs.set(taskId, output);
  }
  return output;
}
function appendTaskOutput(taskId, content) {
  getOrCreateOutput(taskId).append(content);
}
async function flushTaskOutput(taskId) {
  const output = outputs.get(taskId);
  if (output) {
    await output.flush();
  }
}
function evictTaskOutput(taskId) {
  return track(
    (async () => {
      const output = outputs.get(taskId);
      if (output) {
        await output.flush();
        outputs.delete(taskId);
      }
    })()
  );
}
async function getTaskOutputDelta(taskId, fromOffset, maxBytes = DEFAULT_MAX_READ_BYTES) {
  try {
    const result = await readFileRange(
      getTaskOutputPath(taskId),
      fromOffset,
      maxBytes
    );
    if (!result) {
      return { content: "", newOffset: fromOffset };
    }
    return {
      content: result.content,
      newOffset: fromOffset + result.bytesRead
    };
  } catch (e) {
    const code = getErrnoCode(e);
    if (code === "ENOENT") {
      return { content: "", newOffset: fromOffset };
    }
    logError(e);
    return { content: "", newOffset: fromOffset };
  }
}
async function getTaskOutput(taskId, maxBytes = DEFAULT_MAX_READ_BYTES) {
  try {
    const { content, bytesTotal, bytesRead } = await tailFile(
      getTaskOutputPath(taskId),
      maxBytes
    );
    if (bytesTotal > bytesRead) {
      return `[${Math.round((bytesTotal - bytesRead) / 1024)}KB of earlier output omitted]
${content}`;
    }
    return content;
  } catch (e) {
    const code = getErrnoCode(e);
    if (code === "ENOENT") {
      return "";
    }
    logError(e);
    return "";
  }
}
async function getTaskOutputSize(taskId) {
  try {
    return (await stat(getTaskOutputPath(taskId))).size;
  } catch (e) {
    const code = getErrnoCode(e);
    if (code === "ENOENT") {
      return 0;
    }
    logError(e);
    return 0;
  }
}
async function cleanupTaskOutput(taskId) {
  const output = outputs.get(taskId);
  if (output) {
    output.cancel();
    outputs.delete(taskId);
  }
  try {
    await unlink(getTaskOutputPath(taskId));
  } catch (e) {
    const code = getErrnoCode(e);
    if (code === "ENOENT") {
      return;
    }
    logError(e);
  }
}
function initTaskOutput(taskId) {
  return track(
    (async () => {
      await ensureOutputDir();
      const outputPath = getTaskOutputPath(taskId);
      const fh = await open(
        outputPath,
        process.platform === "win32" ? "wx" : fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | O_NOFOLLOW
      );
      await fh.close();
      return outputPath;
    })()
  );
}
function initTaskOutputAsSymlink(taskId, targetPath) {
  return track(
    (async () => {
      try {
        await ensureOutputDir();
        const outputPath = getTaskOutputPath(taskId);
        try {
          await symlink(targetPath, outputPath);
        } catch {
          await unlink(outputPath);
          await symlink(targetPath, outputPath);
        }
        return outputPath;
      } catch (error) {
        logError(error);
        return initTaskOutput(taskId);
      }
    })()
  );
}
export {
  DiskTaskOutput,
  MAX_TASK_OUTPUT_BYTES,
  MAX_TASK_OUTPUT_BYTES_DISPLAY,
  _clearOutputsForTest,
  _resetTaskOutputDirForTest,
  appendTaskOutput,
  cleanupTaskOutput,
  evictTaskOutput,
  flushTaskOutput,
  getTaskOutput,
  getTaskOutputDelta,
  getTaskOutputDir,
  getTaskOutputPath,
  getTaskOutputSize,
  initTaskOutput,
  initTaskOutputAsSymlink
};
