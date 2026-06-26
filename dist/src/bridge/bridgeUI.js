import chalk from "chalk";
import { toString as qrToString } from "qrcode";
import {
  BRIDGE_FAILED_INDICATOR,
  BRIDGE_READY_INDICATOR,
  BRIDGE_SPINNER_FRAMES
} from "../constants/figures.js";
import { stringWidth } from "../ink/stringWidth.js";
import { logForDebugging } from "../utils/debug.js";
import {
  buildActiveFooterText,
  buildBridgeConnectUrl,
  buildBridgeSessionUrl,
  buildIdleFooterText,
  FAILED_FOOTER_TEXT,
  formatDuration,
  TOOL_DISPLAY_EXPIRY_MS,
  timestamp,
  truncatePrompt,
  wrapWithOsc8Link
} from "./bridgeStatusUtil.js";
const QR_OPTIONS = {
  type: "utf8",
  errorCorrectionLevel: "L",
  small: true
};
async function generateQr(url) {
  const qr = await qrToString(url, QR_OPTIONS);
  return qr.split("\n").filter((line) => line.length > 0);
}
function createBridgeLogger(options) {
  const write = options.write ?? ((s) => process.stdout.write(s));
  const verbose = options.verbose;
  let statusLineCount = 0;
  let currentState = "idle";
  let currentStateText = "Ready";
  let repoName = "";
  let branch = "";
  let debugLogPath = "";
  let connectUrl = "";
  let cachedIngressUrl = "";
  let cachedEnvironmentId = "";
  let activeSessionUrl = null;
  let qrLines = [];
  let qrVisible = false;
  let lastToolSummary = null;
  let lastToolTime = 0;
  let sessionActive = 0;
  let sessionMax = 1;
  let spawnModeDisplay = null;
  let spawnMode = "single-session";
  const sessionDisplayInfo = /* @__PURE__ */ new Map();
  let connectingTimer = null;
  let connectingTick = 0;
  function countVisualLines(text) {
    const cols = process.stdout.columns || 80;
    let count = 0;
    for (const logical of text.split("\n")) {
      if (logical.length === 0) {
        count++;
        continue;
      }
      const width = stringWidth(logical);
      count += Math.max(1, Math.ceil(width / cols));
    }
    if (text.endsWith("\n")) {
      count--;
    }
    return count;
  }
  function writeStatus(text) {
    write(text);
    statusLineCount += countVisualLines(text);
  }
  function clearStatusLines() {
    if (statusLineCount <= 0) return;
    logForDebugging(`[bridge:ui] clearStatusLines count=${statusLineCount}`);
    write(`\x1B[${statusLineCount}A`);
    write("\x1B[J");
    statusLineCount = 0;
  }
  function printLog(line) {
    clearStatusLines();
    write(line);
  }
  function regenerateQr(url) {
    generateQr(url).then((lines) => {
      qrLines = lines;
      renderStatusLine();
    }).catch((e) => {
      logForDebugging(`QR code generation failed: ${e}`, { level: "error" });
    });
  }
  function renderConnectingLine() {
    clearStatusLines();
    const frame = BRIDGE_SPINNER_FRAMES[connectingTick % BRIDGE_SPINNER_FRAMES.length];
    let suffix = "";
    if (repoName) {
      suffix += chalk.dim(" \xB7 ") + chalk.dim(repoName);
    }
    if (branch) {
      suffix += chalk.dim(" \xB7 ") + chalk.dim(branch);
    }
    writeStatus(
      `${chalk.yellow(frame)} ${chalk.yellow("Connecting")}${suffix}
`
    );
  }
  function startConnecting() {
    stopConnecting();
    renderConnectingLine();
    connectingTimer = setInterval(() => {
      connectingTick++;
      renderConnectingLine();
    }, 150);
  }
  function stopConnecting() {
    if (connectingTimer) {
      clearInterval(connectingTimer);
      connectingTimer = null;
    }
  }
  function renderStatusLine() {
    if (currentState === "reconnecting" || currentState === "failed") {
      return;
    }
    clearStatusLines();
    const isIdle = currentState === "idle";
    if (qrVisible) {
      for (const line of qrLines) {
        writeStatus(`${chalk.dim(line)}
`);
      }
    }
    const indicator = BRIDGE_READY_INDICATOR;
    const indicatorColor = isIdle ? chalk.green : chalk.cyan;
    const baseColor = isIdle ? chalk.green : chalk.cyan;
    const stateText = baseColor(currentStateText);
    let suffix = "";
    if (repoName) {
      suffix += chalk.dim(" \xB7 ") + chalk.dim(repoName);
    }
    if (branch && spawnMode !== "worktree") {
      suffix += chalk.dim(" \xB7 ") + chalk.dim(branch);
    }
    if (process.env.USER_TYPE === "ant" && debugLogPath) {
      writeStatus(
        `${chalk.yellow("[ANT-ONLY] Logs:")} ${chalk.dim(debugLogPath)}
`
      );
    }
    writeStatus(`${indicatorColor(indicator)} ${stateText}${suffix}
`);
    if (sessionMax > 1) {
      const modeHint = spawnMode === "worktree" ? "New sessions will be created in an isolated worktree" : "New sessions will be created in the current directory";
      writeStatus(
        `    ${chalk.dim(`Capacity: ${sessionActive}/${sessionMax} \xB7 ${modeHint}`)}
`
      );
      for (const [, info] of sessionDisplayInfo) {
        const titleText = info.title ? truncatePrompt(info.title, 35) : chalk.dim("Attached");
        const titleLinked = wrapWithOsc8Link(titleText, info.url);
        const act = info.activity;
        const showAct = act && act.type !== "result" && act.type !== "error";
        const actText = showAct ? chalk.dim(` ${truncatePrompt(act.summary, 40)}`) : "";
        writeStatus(`    ${titleLinked}${actText}
`);
      }
    }
    if (sessionMax === 1) {
      const modeText = spawnMode === "single-session" ? "Single session \xB7 exits when complete" : spawnMode === "worktree" ? `Capacity: ${sessionActive}/1 \xB7 New sessions will be created in an isolated worktree` : `Capacity: ${sessionActive}/1 \xB7 New sessions will be created in the current directory`;
      writeStatus(`    ${chalk.dim(modeText)}
`);
    }
    if (sessionMax === 1 && !isIdle && lastToolSummary && Date.now() - lastToolTime < TOOL_DISPLAY_EXPIRY_MS) {
      writeStatus(`  ${chalk.dim(truncatePrompt(lastToolSummary, 60))}
`);
    }
    const url = activeSessionUrl ?? connectUrl;
    if (url) {
      writeStatus("\n");
      const footerText = isIdle ? buildIdleFooterText(url) : buildActiveFooterText(url);
      const qrHint = qrVisible ? chalk.dim.italic("space to hide QR code") : chalk.dim.italic("space to show QR code");
      const toggleHint = spawnModeDisplay ? chalk.dim.italic(" \xB7 w to toggle spawn mode") : "";
      writeStatus(`${chalk.dim(footerText)}
`);
      writeStatus(`${qrHint}${toggleHint}
`);
    }
  }
  return {
    printBanner(config, environmentId) {
      cachedIngressUrl = config.sessionIngressUrl;
      cachedEnvironmentId = environmentId;
      connectUrl = buildBridgeConnectUrl(environmentId, cachedIngressUrl);
      regenerateQr(connectUrl);
      if (verbose) {
        write(chalk.dim(`Remote Control`) + ` v${"0.0.0"}
`);
      }
      if (verbose) {
        if (config.spawnMode !== "single-session") {
          write(chalk.dim(`Spawn mode: `) + `${config.spawnMode}
`);
          write(
            chalk.dim(`Max concurrent sessions: `) + `${config.maxSessions}
`
          );
        }
        write(chalk.dim(`Environment ID: `) + `${environmentId}
`);
      }
      if (config.sandbox) {
        write(chalk.dim(`Sandbox: `) + `${chalk.green("Enabled")}
`);
      }
      write("\n");
      startConnecting();
    },
    logSessionStart(sessionId, prompt) {
      if (verbose) {
        const short = truncatePrompt(prompt, 80);
        printLog(
          chalk.dim(`[${timestamp()}]`) + ` Session started: ${chalk.white(`"${short}"`)} (${chalk.dim(sessionId)})
`
        );
      }
    },
    logSessionComplete(sessionId, durationMs) {
      printLog(
        chalk.dim(`[${timestamp()}]`) + ` Session ${chalk.green("completed")} (${formatDuration(durationMs)}) ${chalk.dim(sessionId)}
`
      );
    },
    logSessionFailed(sessionId, error) {
      printLog(
        chalk.dim(`[${timestamp()}]`) + ` Session ${chalk.red("failed")}: ${error} ${chalk.dim(sessionId)}
`
      );
    },
    logStatus(message) {
      printLog(chalk.dim(`[${timestamp()}]`) + ` ${message}
`);
    },
    logVerbose(message) {
      if (verbose) {
        printLog(chalk.dim(`[${timestamp()}] ${message}`) + "\n");
      }
    },
    logError(message) {
      printLog(chalk.red(`[${timestamp()}] Error: ${message}`) + "\n");
    },
    logReconnected(disconnectedMs) {
      printLog(
        chalk.dim(`[${timestamp()}]`) + ` ${chalk.green("Reconnected")} after ${formatDuration(disconnectedMs)}
`
      );
    },
    setRepoInfo(repo, branchName) {
      repoName = repo;
      branch = branchName;
    },
    setDebugLogPath(path) {
      debugLogPath = path;
    },
    updateIdleStatus() {
      stopConnecting();
      currentState = "idle";
      currentStateText = "Ready";
      lastToolSummary = null;
      lastToolTime = 0;
      activeSessionUrl = null;
      regenerateQr(connectUrl);
      renderStatusLine();
    },
    setAttached(sessionId) {
      stopConnecting();
      currentState = "attached";
      currentStateText = "Connected";
      lastToolSummary = null;
      lastToolTime = 0;
      if (sessionMax <= 1) {
        activeSessionUrl = buildBridgeSessionUrl(
          sessionId,
          cachedEnvironmentId,
          cachedIngressUrl
        );
        regenerateQr(activeSessionUrl);
      }
      renderStatusLine();
    },
    updateReconnectingStatus(delayStr, elapsedStr) {
      stopConnecting();
      clearStatusLines();
      currentState = "reconnecting";
      if (qrVisible) {
        for (const line of qrLines) {
          writeStatus(`${chalk.dim(line)}
`);
        }
      }
      const frame = BRIDGE_SPINNER_FRAMES[connectingTick % BRIDGE_SPINNER_FRAMES.length];
      connectingTick++;
      writeStatus(
        `${chalk.yellow(frame)} ${chalk.yellow("Reconnecting")} ${chalk.dim("\xB7")} ${chalk.dim(`retrying in ${delayStr}`)} ${chalk.dim("\xB7")} ${chalk.dim(`disconnected ${elapsedStr}`)}
`
      );
    },
    updateFailedStatus(error) {
      stopConnecting();
      clearStatusLines();
      currentState = "failed";
      let suffix = "";
      if (repoName) {
        suffix += chalk.dim(" \xB7 ") + chalk.dim(repoName);
      }
      if (branch) {
        suffix += chalk.dim(" \xB7 ") + chalk.dim(branch);
      }
      writeStatus(
        `${chalk.red(BRIDGE_FAILED_INDICATOR)} ${chalk.red("Remote Control Failed")}${suffix}
`
      );
      writeStatus(`${chalk.dim(FAILED_FOOTER_TEXT)}
`);
      if (error) {
        writeStatus(`${chalk.red(error)}
`);
      }
    },
    updateSessionStatus(_sessionId, _elapsed, activity, _trail) {
      if (activity.type === "tool_start") {
        lastToolSummary = activity.summary;
        lastToolTime = Date.now();
      }
      renderStatusLine();
    },
    clearStatus() {
      stopConnecting();
      clearStatusLines();
    },
    toggleQr() {
      qrVisible = !qrVisible;
      renderStatusLine();
    },
    updateSessionCount(active, max, mode) {
      if (sessionActive === active && sessionMax === max && spawnMode === mode)
        return;
      sessionActive = active;
      sessionMax = max;
      spawnMode = mode;
    },
    setSpawnModeDisplay(mode) {
      if (spawnModeDisplay === mode) return;
      spawnModeDisplay = mode;
      if (mode) spawnMode = mode;
    },
    addSession(sessionId, url) {
      sessionDisplayInfo.set(sessionId, { url });
    },
    updateSessionActivity(sessionId, activity) {
      const info = sessionDisplayInfo.get(sessionId);
      if (!info) return;
      info.activity = activity;
    },
    setSessionTitle(sessionId, title) {
      const info = sessionDisplayInfo.get(sessionId);
      if (!info) return;
      info.title = title;
      if (currentState === "reconnecting" || currentState === "failed") return;
      if (sessionMax === 1) {
        currentState = "titled";
        currentStateText = truncatePrompt(title, 40);
      }
      renderStatusLine();
    },
    removeSession(sessionId) {
      sessionDisplayInfo.delete(sessionId);
    },
    refreshDisplay() {
      if (currentState === "reconnecting" || currentState === "failed") return;
      renderStatusLine();
    }
  };
}
export {
  createBridgeLogger
};
