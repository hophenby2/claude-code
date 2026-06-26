import { logForDebugging } from "../../utils/debug.js";
import { isBareMode } from "../../utils/envUtils.js";
import { errorMessage } from "../../utils/errors.js";
import { logError } from "../../utils/log.js";
import {
  createLSPServerManager
} from "./LSPServerManager.js";
import { registerLSPNotificationHandlers } from "./passiveFeedback.js";
let lspManagerInstance;
let initializationState = "not-started";
let initializationError;
let initializationGeneration = 0;
let initializationPromise;
function _resetLspManagerForTesting() {
  initializationState = "not-started";
  initializationError = void 0;
  initializationPromise = void 0;
  initializationGeneration++;
}
function getLspServerManager() {
  if (initializationState === "failed") {
    return void 0;
  }
  return lspManagerInstance;
}
function getInitializationStatus() {
  if (initializationState === "failed") {
    return {
      status: "failed",
      error: initializationError || new Error("Initialization failed")
    };
  }
  if (initializationState === "not-started") {
    return { status: "not-started" };
  }
  if (initializationState === "pending") {
    return { status: "pending" };
  }
  return { status: "success" };
}
function isLspConnected() {
  if (initializationState === "failed") return false;
  const manager = getLspServerManager();
  if (!manager) return false;
  const servers = manager.getAllServers();
  if (servers.size === 0) return false;
  for (const server of servers.values()) {
    if (server.state !== "error") return true;
  }
  return false;
}
async function waitForInitialization() {
  if (initializationState === "success" || initializationState === "failed") {
    return;
  }
  if (initializationState === "pending" && initializationPromise) {
    await initializationPromise;
  }
}
function initializeLspServerManager() {
  if (isBareMode()) {
    return;
  }
  logForDebugging("[LSP MANAGER] initializeLspServerManager() called");
  if (lspManagerInstance !== void 0 && initializationState !== "failed") {
    logForDebugging(
      "[LSP MANAGER] Already initialized or initializing, skipping"
    );
    return;
  }
  if (initializationState === "failed") {
    lspManagerInstance = void 0;
    initializationError = void 0;
  }
  lspManagerInstance = createLSPServerManager();
  initializationState = "pending";
  logForDebugging("[LSP MANAGER] Created manager instance, state=pending");
  const currentGeneration = ++initializationGeneration;
  logForDebugging(
    `[LSP MANAGER] Starting async initialization (generation ${currentGeneration})`
  );
  initializationPromise = lspManagerInstance.initialize().then(() => {
    if (currentGeneration === initializationGeneration) {
      initializationState = "success";
      logForDebugging("LSP server manager initialized successfully");
      if (lspManagerInstance) {
        registerLSPNotificationHandlers(lspManagerInstance);
      }
    }
  }).catch((error) => {
    if (currentGeneration === initializationGeneration) {
      initializationState = "failed";
      initializationError = error;
      lspManagerInstance = void 0;
      logError(error);
      logForDebugging(
        `Failed to initialize LSP server manager: ${errorMessage(error)}`
      );
    }
  });
}
function reinitializeLspServerManager() {
  if (initializationState === "not-started") {
    return;
  }
  logForDebugging("[LSP MANAGER] reinitializeLspServerManager() called");
  if (lspManagerInstance) {
    void lspManagerInstance.shutdown().catch((err) => {
      logForDebugging(
        `[LSP MANAGER] old instance shutdown during reinit failed: ${errorMessage(err)}`
      );
    });
  }
  lspManagerInstance = void 0;
  initializationState = "not-started";
  initializationError = void 0;
  initializeLspServerManager();
}
async function shutdownLspServerManager() {
  if (lspManagerInstance === void 0) {
    return;
  }
  try {
    await lspManagerInstance.shutdown();
    logForDebugging("LSP server manager shut down successfully");
  } catch (error) {
    logError(error);
    logForDebugging(
      `Failed to shutdown LSP server manager: ${errorMessage(error)}`
    );
  } finally {
    lspManagerInstance = void 0;
    initializationState = "not-started";
    initializationError = void 0;
    initializationPromise = void 0;
    initializationGeneration++;
  }
}
export {
  _resetLspManagerForTesting,
  getInitializationStatus,
  getLspServerManager,
  initializeLspServerManager,
  isLspConnected,
  reinitializeLspServerManager,
  shutdownLspServerManager,
  waitForInitialization
};
