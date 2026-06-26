import { stat } from "fs/promises";
import treeKill from "tree-kill";
import { generateTaskId } from "../Task.js";
import { formatDuration } from "./format.js";
import {
  MAX_TASK_OUTPUT_BYTES,
  MAX_TASK_OUTPUT_BYTES_DISPLAY
} from "./task/diskOutput.js";
import { TaskOutput } from "./task/TaskOutput.js";
const SIGKILL = 137;
const SIGTERM = 143;
const SIZE_WATCHDOG_INTERVAL_MS = 5e3;
function prependStderr(prefix, stderr) {
  return stderr ? `${prefix} ${stderr}` : prefix;
}
class StreamWrapper {
  #stream;
  #isCleanedUp = false;
  #taskOutput;
  #isStderr;
  #onData = this.#dataHandler.bind(this);
  constructor(stream, taskOutput, isStderr) {
    this.#stream = stream;
    this.#taskOutput = taskOutput;
    this.#isStderr = isStderr;
    stream.setEncoding("utf-8");
    stream.on("data", this.#onData);
  }
  #dataHandler(data) {
    const str = typeof data === "string" ? data : data.toString();
    if (this.#isStderr) {
      this.#taskOutput.writeStderr(str);
    } else {
      this.#taskOutput.writeStdout(str);
    }
  }
  cleanup() {
    if (this.#isCleanedUp) {
      return;
    }
    this.#isCleanedUp = true;
    this.#stream.removeListener("data", this.#onData);
    this.#stream = null;
    this.#taskOutput = null;
    this.#onData = () => {
    };
  }
}
class ShellCommandImpl {
  #status = "running";
  #backgroundTaskId;
  #stdoutWrapper;
  #stderrWrapper;
  #childProcess;
  #timeoutId = null;
  #sizeWatchdog = null;
  #killedForSize = false;
  #maxOutputBytes;
  #abortSignal;
  #onTimeoutCallback;
  #timeout;
  #shouldAutoBackground;
  #resultResolver = null;
  #exitCodeResolver = null;
  #boundAbortHandler = null;
  taskOutput;
  static #handleTimeout(self) {
    if (self.#shouldAutoBackground && self.#onTimeoutCallback) {
      self.#onTimeoutCallback(self.background.bind(self));
    } else {
      self.#doKill(SIGTERM);
    }
  }
  result;
  onTimeout;
  constructor(childProcess, abortSignal, timeout, taskOutput, shouldAutoBackground = false, maxOutputBytes = MAX_TASK_OUTPUT_BYTES) {
    this.#childProcess = childProcess;
    this.#abortSignal = abortSignal;
    this.#timeout = timeout;
    this.#shouldAutoBackground = shouldAutoBackground;
    this.#maxOutputBytes = maxOutputBytes;
    this.taskOutput = taskOutput;
    this.#stderrWrapper = childProcess.stderr ? new StreamWrapper(childProcess.stderr, taskOutput, true) : null;
    this.#stdoutWrapper = childProcess.stdout ? new StreamWrapper(childProcess.stdout, taskOutput, false) : null;
    if (shouldAutoBackground) {
      this.onTimeout = (callback) => {
        this.#onTimeoutCallback = callback;
      };
    }
    this.result = this.#createResultPromise();
  }
  get status() {
    return this.#status;
  }
  #abortHandler() {
    if (this.#abortSignal.reason === "interrupt") {
      return;
    }
    this.kill();
  }
  #exitHandler(code, signal) {
    const exitCode = code !== null && code !== void 0 ? code : signal === "SIGTERM" ? 144 : 1;
    this.#resolveExitCode(exitCode);
  }
  #errorHandler() {
    this.#resolveExitCode(1);
  }
  #resolveExitCode(code) {
    if (this.#exitCodeResolver) {
      this.#exitCodeResolver(code);
      this.#exitCodeResolver = null;
    }
  }
  // Note: exit/error listeners are NOT removed here — they're needed for
  // the result promise to resolve. They clean up when the child process exits.
  #cleanupListeners() {
    this.#clearSizeWatchdog();
    const timeoutId = this.#timeoutId;
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.#timeoutId = null;
    }
    const boundAbortHandler = this.#boundAbortHandler;
    if (boundAbortHandler) {
      this.#abortSignal.removeEventListener("abort", boundAbortHandler);
      this.#boundAbortHandler = null;
    }
  }
  #clearSizeWatchdog() {
    if (this.#sizeWatchdog) {
      clearInterval(this.#sizeWatchdog);
      this.#sizeWatchdog = null;
    }
  }
  #startSizeWatchdog() {
    this.#sizeWatchdog = setInterval(() => {
      void stat(this.taskOutput.path).then(
        (s) => {
          if (s.size > this.#maxOutputBytes && this.#status === "backgrounded" && this.#sizeWatchdog !== null) {
            this.#killedForSize = true;
            this.#clearSizeWatchdog();
            this.#doKill(SIGKILL);
          }
        },
        () => {
        }
      );
    }, SIZE_WATCHDOG_INTERVAL_MS);
    this.#sizeWatchdog.unref();
  }
  #createResultPromise() {
    this.#boundAbortHandler = this.#abortHandler.bind(this);
    this.#abortSignal.addEventListener("abort", this.#boundAbortHandler, {
      once: true
    });
    this.#childProcess.once("exit", this.#exitHandler.bind(this));
    this.#childProcess.once("error", this.#errorHandler.bind(this));
    this.#timeoutId = setTimeout(
      ShellCommandImpl.#handleTimeout,
      this.#timeout,
      this
    );
    const exitPromise = new Promise((resolve) => {
      this.#exitCodeResolver = resolve;
    });
    return new Promise((resolve) => {
      this.#resultResolver = resolve;
      void exitPromise.then(this.#handleExit.bind(this));
    });
  }
  async #handleExit(code) {
    this.#cleanupListeners();
    if (this.#status === "running" || this.#status === "backgrounded") {
      this.#status = "completed";
    }
    const stdout = await this.taskOutput.getStdout();
    const result = {
      code,
      stdout,
      stderr: this.taskOutput.getStderr(),
      interrupted: code === SIGKILL,
      backgroundTaskId: this.#backgroundTaskId
    };
    if (this.taskOutput.stdoutToFile && !this.#backgroundTaskId) {
      if (this.taskOutput.outputFileRedundant) {
        void this.taskOutput.deleteOutputFile();
      } else {
        result.outputFilePath = this.taskOutput.path;
        result.outputFileSize = this.taskOutput.outputFileSize;
        result.outputTaskId = this.taskOutput.taskId;
      }
    }
    if (this.#killedForSize) {
      result.stderr = prependStderr(
        `Background command killed: output file exceeded ${MAX_TASK_OUTPUT_BYTES_DISPLAY}`,
        result.stderr
      );
    } else if (code === SIGTERM) {
      result.stderr = prependStderr(
        `Command timed out after ${formatDuration(this.#timeout)}`,
        result.stderr
      );
    }
    const resultResolver = this.#resultResolver;
    if (resultResolver) {
      this.#resultResolver = null;
      resultResolver(result);
    }
  }
  #doKill(code) {
    this.#status = "killed";
    if (this.#childProcess.pid) {
      treeKill(this.#childProcess.pid, "SIGKILL");
    }
    this.#resolveExitCode(code ?? SIGKILL);
  }
  kill() {
    this.#doKill();
  }
  background(taskId) {
    if (this.#status === "running") {
      this.#backgroundTaskId = taskId;
      this.#status = "backgrounded";
      this.#cleanupListeners();
      if (this.taskOutput.stdoutToFile) {
        this.#startSizeWatchdog();
      } else {
        this.taskOutput.spillToDisk();
      }
      return true;
    }
    return false;
  }
  cleanup() {
    this.#stdoutWrapper?.cleanup();
    this.#stderrWrapper?.cleanup();
    this.taskOutput.clear();
    this.#cleanupListeners();
    this.#childProcess = null;
    this.#abortSignal = null;
    this.#onTimeoutCallback = void 0;
  }
}
function wrapSpawn(childProcess, abortSignal, timeout, taskOutput, shouldAutoBackground = false, maxOutputBytes = MAX_TASK_OUTPUT_BYTES) {
  return new ShellCommandImpl(
    childProcess,
    abortSignal,
    timeout,
    taskOutput,
    shouldAutoBackground,
    maxOutputBytes
  );
}
class AbortedShellCommand {
  status = "killed";
  result;
  taskOutput;
  constructor(opts) {
    this.taskOutput = new TaskOutput(generateTaskId("local_bash"), null);
    this.result = Promise.resolve({
      code: opts?.code ?? 145,
      stdout: "",
      stderr: opts?.stderr ?? "Command aborted before execution",
      interrupted: true,
      backgroundTaskId: opts?.backgroundTaskId
    });
  }
  background() {
    return false;
  }
  kill() {
  }
  cleanup() {
  }
}
function createAbortedCommand(backgroundTaskId, opts) {
  return new AbortedShellCommand({
    backgroundTaskId,
    ...opts
  });
}
function createFailedCommand(preSpawnError) {
  const taskOutput = new TaskOutput(generateTaskId("local_bash"), null);
  return {
    status: "completed",
    result: Promise.resolve({
      code: 1,
      stdout: "",
      stderr: preSpawnError,
      interrupted: false,
      preSpawnError
    }),
    taskOutput,
    background() {
      return false;
    },
    kill() {
    },
    cleanup() {
    }
  };
}
export {
  createAbortedCommand,
  createFailedCommand,
  wrapSpawn
};
