import { spawn } from "child_process";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  Trace
} from "vscode-jsonrpc/node.js";
import { logForDebugging } from "../../utils/debug.js";
import { errorMessage } from "../../utils/errors.js";
import { logError } from "../../utils/log.js";
import { subprocessEnv } from "../../utils/subprocessEnv.js";
function createLSPClient(serverName, onCrash) {
  let process;
  let connection;
  let capabilities;
  let isInitialized = false;
  let startFailed = false;
  let startError;
  let isStopping = false;
  const pendingHandlers = [];
  const pendingRequestHandlers = [];
  function checkStartFailed() {
    if (startFailed) {
      throw startError || new Error(`LSP server ${serverName} failed to start`);
    }
  }
  return {
    get capabilities() {
      return capabilities;
    },
    get isInitialized() {
      return isInitialized;
    },
    async start(command, args, options) {
      try {
        process = spawn(command, args, {
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...subprocessEnv(), ...options?.env },
          cwd: options?.cwd,
          // Prevent visible console window on Windows (no-op on other platforms)
          windowsHide: true
        });
        if (!process.stdout || !process.stdin) {
          throw new Error("LSP server process stdio not available");
        }
        const spawnedProcess = process;
        await new Promise((resolve, reject) => {
          const onSpawn = () => {
            cleanup();
            resolve();
          };
          const onError = (error) => {
            cleanup();
            reject(error);
          };
          const cleanup = () => {
            spawnedProcess.removeListener("spawn", onSpawn);
            spawnedProcess.removeListener("error", onError);
          };
          spawnedProcess.once("spawn", onSpawn);
          spawnedProcess.once("error", onError);
        });
        if (process.stderr) {
          process.stderr.on("data", (data) => {
            const output = data.toString().trim();
            if (output) {
              logForDebugging(`[LSP SERVER ${serverName}] ${output}`);
            }
          });
        }
        process.on("error", (error) => {
          if (!isStopping) {
            startFailed = true;
            startError = error;
            logError(
              new Error(
                `LSP server ${serverName} failed to start: ${error.message}`
              )
            );
          }
        });
        process.on("exit", (code, _signal) => {
          if (code !== 0 && code !== null && !isStopping) {
            isInitialized = false;
            startFailed = false;
            startError = void 0;
            const crashError = new Error(
              `LSP server ${serverName} crashed with exit code ${code}`
            );
            logError(crashError);
            onCrash?.(crashError);
          }
        });
        process.stdin.on("error", (error) => {
          if (!isStopping) {
            logForDebugging(
              `LSP server ${serverName} stdin error: ${error.message}`
            );
          }
        });
        const reader = new StreamMessageReader(process.stdout);
        const writer = new StreamMessageWriter(process.stdin);
        connection = createMessageConnection(reader, writer);
        connection.onError(([error, _message, _code]) => {
          if (!isStopping) {
            startFailed = true;
            startError = error;
            logError(
              new Error(
                `LSP server ${serverName} connection error: ${error.message}`
              )
            );
          }
        });
        connection.onClose(() => {
          if (!isStopping) {
            isInitialized = false;
            logForDebugging(`LSP server ${serverName} connection closed`);
          }
        });
        connection.listen();
        connection.trace(Trace.Verbose, {
          log: (message) => {
            logForDebugging(`[LSP PROTOCOL ${serverName}] ${message}`);
          }
        }).catch((error) => {
          logForDebugging(
            `Failed to enable tracing for ${serverName}: ${error.message}`
          );
        });
        for (const { method, handler } of pendingHandlers) {
          connection.onNotification(method, handler);
          logForDebugging(
            `Applied queued notification handler for ${serverName}.${method}`
          );
        }
        pendingHandlers.length = 0;
        for (const { method, handler } of pendingRequestHandlers) {
          connection.onRequest(method, handler);
          logForDebugging(
            `Applied queued request handler for ${serverName}.${method}`
          );
        }
        pendingRequestHandlers.length = 0;
        logForDebugging(`LSP client started for ${serverName}`);
      } catch (error) {
        const err = error;
        logError(
          new Error(`LSP server ${serverName} failed to start: ${err.message}`)
        );
        throw error;
      }
    },
    async initialize(params) {
      if (!connection) {
        throw new Error("LSP client not started");
      }
      checkStartFailed();
      try {
        const result = await connection.sendRequest(
          "initialize",
          params
        );
        capabilities = result.capabilities;
        await connection.sendNotification("initialized", {});
        isInitialized = true;
        logForDebugging(`LSP server ${serverName} initialized`);
        return result;
      } catch (error) {
        const err = error;
        logError(
          new Error(
            `LSP server ${serverName} initialize failed: ${err.message}`
          )
        );
        throw error;
      }
    },
    async sendRequest(method, params) {
      if (!connection) {
        throw new Error("LSP client not started");
      }
      checkStartFailed();
      if (!isInitialized) {
        throw new Error("LSP server not initialized");
      }
      try {
        return await connection.sendRequest(method, params);
      } catch (error) {
        const err = error;
        logError(
          new Error(
            `LSP server ${serverName} request ${method} failed: ${err.message}`
          )
        );
        throw error;
      }
    },
    async sendNotification(method, params) {
      if (!connection) {
        throw new Error("LSP client not started");
      }
      checkStartFailed();
      try {
        await connection.sendNotification(method, params);
      } catch (error) {
        const err = error;
        logError(
          new Error(
            `LSP server ${serverName} notification ${method} failed: ${err.message}`
          )
        );
        logForDebugging(`Notification ${method} failed but continuing`);
      }
    },
    onNotification(method, handler) {
      if (!connection) {
        pendingHandlers.push({ method, handler });
        logForDebugging(
          `Queued notification handler for ${serverName}.${method} (connection not ready)`
        );
        return;
      }
      checkStartFailed();
      connection.onNotification(method, handler);
    },
    onRequest(method, handler) {
      if (!connection) {
        pendingRequestHandlers.push({
          method,
          handler
        });
        logForDebugging(
          `Queued request handler for ${serverName}.${method} (connection not ready)`
        );
        return;
      }
      checkStartFailed();
      connection.onRequest(method, handler);
    },
    async stop() {
      let shutdownError;
      isStopping = true;
      try {
        if (connection) {
          await connection.sendRequest("shutdown", {});
          await connection.sendNotification("exit", {});
        }
      } catch (error) {
        const err = error;
        logError(
          new Error(`LSP server ${serverName} stop failed: ${err.message}`)
        );
        shutdownError = err;
      } finally {
        if (connection) {
          try {
            connection.dispose();
          } catch (error) {
            logForDebugging(
              `Connection disposal failed for ${serverName}: ${errorMessage(error)}`
            );
          }
          connection = void 0;
        }
        if (process) {
          process.removeAllListeners("error");
          process.removeAllListeners("exit");
          if (process.stdin) {
            process.stdin.removeAllListeners("error");
          }
          if (process.stderr) {
            process.stderr.removeAllListeners("data");
          }
          try {
            process.kill();
          } catch (error) {
            logForDebugging(
              `Process kill failed for ${serverName} (may already be dead): ${errorMessage(error)}`
            );
          }
          process = void 0;
        }
        isInitialized = false;
        capabilities = void 0;
        isStopping = false;
        if (shutdownError) {
          startFailed = true;
          startError = shutdownError;
        }
        logForDebugging(`LSP client stopped for ${serverName}`);
      }
      if (shutdownError) {
        throw shutdownError;
      }
    }
  };
}
export {
  createLSPClient
};
