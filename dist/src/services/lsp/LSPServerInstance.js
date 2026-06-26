import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
import * as path from "path";
import { pathToFileURL } from "url";
import { getCwd } from "../../utils/cwd.js";
import { logForDebugging } from "../../utils/debug.js";
import { errorMessage } from "../../utils/errors.js";
import { logError } from "../../utils/log.js";
import { sleep } from "../../utils/sleep.js";
const LSP_ERROR_CONTENT_MODIFIED = -32801;
const MAX_RETRIES_FOR_TRANSIENT_ERRORS = 3;
const RETRY_BASE_DELAY_MS = 500;
function createLSPServerInstance(name, config) {
  if (config.restartOnCrash !== void 0) {
    throw new Error(
      `LSP server '${name}': restartOnCrash is not yet implemented. Remove this field from the configuration.`
    );
  }
  if (config.shutdownTimeout !== void 0) {
    throw new Error(
      `LSP server '${name}': shutdownTimeout is not yet implemented. Remove this field from the configuration.`
    );
  }
  const { createLSPClient } = require2("./LSPClient.js");
  let state = "stopped";
  let startTime;
  let lastError;
  let restartCount = 0;
  let crashRecoveryCount = 0;
  const client = createLSPClient(name, (error) => {
    state = "error";
    lastError = error;
    crashRecoveryCount++;
  });
  async function start() {
    if (state === "running" || state === "starting") {
      return;
    }
    const maxRestarts = config.maxRestarts ?? 3;
    if (state === "error" && crashRecoveryCount > maxRestarts) {
      const error = new Error(
        `LSP server '${name}' exceeded max crash recovery attempts (${maxRestarts})`
      );
      lastError = error;
      logError(error);
      throw error;
    }
    let initPromise;
    try {
      state = "starting";
      logForDebugging(`Starting LSP server instance: ${name}`);
      await client.start(config.command, config.args || [], {
        env: config.env,
        cwd: config.workspaceFolder
      });
      const workspaceFolder = config.workspaceFolder || getCwd();
      const workspaceUri = pathToFileURL(workspaceFolder).href;
      const initParams = {
        processId: process.pid,
        // Pass server-specific initialization options from plugin config
        // Required by vue-language-server, optional for others
        // Provide empty object as default to avoid undefined errors in servers
        // that expect this field to exist
        initializationOptions: config.initializationOptions ?? {},
        // Modern approach (LSP 3.16+) - required for Pyright, gopls
        workspaceFolders: [
          {
            uri: workspaceUri,
            name: path.basename(workspaceFolder)
          }
        ],
        // Deprecated fields - some servers still need these for proper URI resolution
        rootPath: workspaceFolder,
        // Deprecated in LSP 3.8 but needed by some servers
        rootUri: workspaceUri,
        // Deprecated in LSP 3.16 but needed by typescript-language-server for goToDefinition
        // Client capabilities - declare what features we support
        capabilities: {
          workspace: {
            // Don't claim to support workspace/configuration since we don't implement it
            // This prevents servers from requesting config we can't provide
            configuration: false,
            // Don't claim to support workspace folders changes since we don't handle
            // workspace/didChangeWorkspaceFolders notifications
            workspaceFolders: false
          },
          textDocument: {
            synchronization: {
              dynamicRegistration: false,
              willSave: false,
              willSaveWaitUntil: false,
              didSave: true
            },
            publishDiagnostics: {
              relatedInformation: true,
              tagSupport: {
                valueSet: [1, 2]
                // Unnecessary (1), Deprecated (2)
              },
              versionSupport: false,
              codeDescriptionSupport: true,
              dataSupport: false
            },
            hover: {
              dynamicRegistration: false,
              contentFormat: ["markdown", "plaintext"]
            },
            definition: {
              dynamicRegistration: false,
              linkSupport: true
            },
            references: {
              dynamicRegistration: false
            },
            documentSymbol: {
              dynamicRegistration: false,
              hierarchicalDocumentSymbolSupport: true
            },
            callHierarchy: {
              dynamicRegistration: false
            }
          },
          general: {
            positionEncodings: ["utf-16"]
          }
        }
      };
      initPromise = client.initialize(initParams);
      if (config.startupTimeout !== void 0) {
        await withTimeout(
          initPromise,
          config.startupTimeout,
          `LSP server '${name}' timed out after ${config.startupTimeout}ms during initialization`
        );
      } else {
        await initPromise;
      }
      state = "running";
      startTime = /* @__PURE__ */ new Date();
      crashRecoveryCount = 0;
      logForDebugging(`LSP server instance started: ${name}`);
    } catch (error) {
      client.stop().catch(() => {
      });
      initPromise?.catch(() => {
      });
      state = "error";
      lastError = error;
      logError(error);
      throw error;
    }
  }
  async function stop() {
    if (state === "stopped" || state === "stopping") {
      return;
    }
    try {
      state = "stopping";
      await client.stop();
      state = "stopped";
      logForDebugging(`LSP server instance stopped: ${name}`);
    } catch (error) {
      state = "error";
      lastError = error;
      logError(error);
      throw error;
    }
  }
  async function restart() {
    try {
      await stop();
    } catch (error) {
      const stopError = new Error(
        `Failed to stop LSP server '${name}' during restart: ${errorMessage(error)}`
      );
      logError(stopError);
      throw stopError;
    }
    restartCount++;
    const maxRestarts = config.maxRestarts ?? 3;
    if (restartCount > maxRestarts) {
      const error = new Error(
        `Max restart attempts (${maxRestarts}) exceeded for server '${name}'`
      );
      logError(error);
      throw error;
    }
    try {
      await start();
    } catch (error) {
      const startError = new Error(
        `Failed to start LSP server '${name}' during restart (attempt ${restartCount}/${maxRestarts}): ${errorMessage(error)}`
      );
      logError(startError);
      throw startError;
    }
  }
  function isHealthy() {
    return state === "running" && client.isInitialized;
  }
  async function sendRequest(method, params) {
    if (!isHealthy()) {
      const error = new Error(
        `Cannot send request to LSP server '${name}': server is ${state}${lastError ? `, last error: ${lastError.message}` : ""}`
      );
      logError(error);
      throw error;
    }
    let lastAttemptError;
    for (let attempt = 0; attempt <= MAX_RETRIES_FOR_TRANSIENT_ERRORS; attempt++) {
      try {
        return await client.sendRequest(method, params);
      } catch (error) {
        lastAttemptError = error;
        const errorCode = error.code;
        const isContentModifiedError = typeof errorCode === "number" && errorCode === LSP_ERROR_CONTENT_MODIFIED;
        if (isContentModifiedError && attempt < MAX_RETRIES_FOR_TRANSIENT_ERRORS) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          logForDebugging(
            `LSP request '${method}' to '${name}' got ContentModified error, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES_FOR_TRANSIENT_ERRORS})\u2026`
          );
          await sleep(delay);
          continue;
        }
        break;
      }
    }
    const requestError = new Error(
      `LSP request '${method}' failed for server '${name}': ${lastAttemptError?.message ?? "unknown error"}`
    );
    logError(requestError);
    throw requestError;
  }
  async function sendNotification(method, params) {
    if (!isHealthy()) {
      const error = new Error(
        `Cannot send notification to LSP server '${name}': server is ${state}`
      );
      logError(error);
      throw error;
    }
    try {
      await client.sendNotification(method, params);
    } catch (error) {
      const notificationError = new Error(
        `LSP notification '${method}' failed for server '${name}': ${errorMessage(error)}`
      );
      logError(notificationError);
      throw notificationError;
    }
  }
  function onNotification(method, handler) {
    client.onNotification(method, handler);
  }
  function onRequest(method, handler) {
    client.onRequest(method, handler);
  }
  return {
    name,
    config,
    get state() {
      return state;
    },
    get startTime() {
      return startTime;
    },
    get lastError() {
      return lastError;
    },
    get restartCount() {
      return restartCount;
    },
    start,
    stop,
    restart,
    isHealthy,
    sendRequest,
    sendNotification,
    onNotification,
    onRequest
  };
}
function withTimeout(promise, ms, message) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout((rej, msg) => rej(new Error(msg)), ms, reject, message);
  });
  return Promise.race([promise, timeoutPromise]).finally(
    () => clearTimeout(timer)
  );
}
export {
  createLSPServerInstance
};
