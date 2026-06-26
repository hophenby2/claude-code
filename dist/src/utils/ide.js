import axios from "axios";
import { execa } from "execa";
import capitalize from "lodash-es/capitalize.js";
import memoize from "lodash-es/memoize.js";
import { createConnection } from "net";
import * as os from "os";
import { basename, join, sep as pathSeparator, resolve } from "path";
import { logEvent } from "../services/analytics/index.js";
import { getIsScrollDraining, getOriginalCwd } from "../bootstrap/state.js";
import { callIdeRpc } from "../services/mcp/client.js";
import { getGlobalConfig, saveGlobalConfig } from "./config.js";
import { env } from "./env.js";
import { getClaudeConfigHomeDir, isEnvTruthy } from "./envUtils.js";
import {
  execFileNoThrow,
  execFileNoThrowWithCwd,
  execSyncWithDefaults_DEPRECATED
} from "./execFileNoThrow.js";
import { getFsImplementation } from "./fsOperations.js";
import { getAncestorPidsAsync } from "./genericProcessUtils.js";
import { isJetBrainsPluginInstalledCached } from "./jetbrains.js";
import { logError } from "./log.js";
import { getPlatform } from "./platform.js";
import { lt } from "./semver.js";
const ideOnboardingDialog = () => require("../components/IdeOnboardingDialog.js");
import { createAbortController } from "./abortController.js";
import { logForDebugging } from "./debug.js";
import { envDynamic } from "./envDynamic.js";
import { errorMessage, isFsInaccessible } from "./errors.js";
import {
  checkWSLDistroMatch,
  WindowsToWSLConverter
} from "./idePathConversion.js";
import { sleep } from "./sleep.js";
import { jsonParse } from "./slowOperations.js";
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function makeAncestorPidLookup() {
  let promise = null;
  return () => {
    if (!promise) {
      promise = getAncestorPidsAsync(process.ppid, 10).then(
        (pids) => new Set(pids)
      );
    }
    return promise;
  };
}
const supportedIdeConfigs = {
  cursor: {
    ideKind: "vscode",
    displayName: "Cursor",
    processKeywordsMac: ["Cursor Helper", "Cursor.app"],
    processKeywordsWindows: ["cursor.exe"],
    processKeywordsLinux: ["cursor"]
  },
  windsurf: {
    ideKind: "vscode",
    displayName: "Windsurf",
    processKeywordsMac: ["Windsurf Helper", "Windsurf.app"],
    processKeywordsWindows: ["windsurf.exe"],
    processKeywordsLinux: ["windsurf"]
  },
  vscode: {
    ideKind: "vscode",
    displayName: "VS Code",
    processKeywordsMac: ["Visual Studio Code", "Code Helper"],
    processKeywordsWindows: ["code.exe"],
    processKeywordsLinux: ["code"]
  },
  intellij: {
    ideKind: "jetbrains",
    displayName: "IntelliJ IDEA",
    processKeywordsMac: ["IntelliJ IDEA"],
    processKeywordsWindows: ["idea64.exe"],
    processKeywordsLinux: ["idea", "intellij"]
  },
  pycharm: {
    ideKind: "jetbrains",
    displayName: "PyCharm",
    processKeywordsMac: ["PyCharm"],
    processKeywordsWindows: ["pycharm64.exe"],
    processKeywordsLinux: ["pycharm"]
  },
  webstorm: {
    ideKind: "jetbrains",
    displayName: "WebStorm",
    processKeywordsMac: ["WebStorm"],
    processKeywordsWindows: ["webstorm64.exe"],
    processKeywordsLinux: ["webstorm"]
  },
  phpstorm: {
    ideKind: "jetbrains",
    displayName: "PhpStorm",
    processKeywordsMac: ["PhpStorm"],
    processKeywordsWindows: ["phpstorm64.exe"],
    processKeywordsLinux: ["phpstorm"]
  },
  rubymine: {
    ideKind: "jetbrains",
    displayName: "RubyMine",
    processKeywordsMac: ["RubyMine"],
    processKeywordsWindows: ["rubymine64.exe"],
    processKeywordsLinux: ["rubymine"]
  },
  clion: {
    ideKind: "jetbrains",
    displayName: "CLion",
    processKeywordsMac: ["CLion"],
    processKeywordsWindows: ["clion64.exe"],
    processKeywordsLinux: ["clion"]
  },
  goland: {
    ideKind: "jetbrains",
    displayName: "GoLand",
    processKeywordsMac: ["GoLand"],
    processKeywordsWindows: ["goland64.exe"],
    processKeywordsLinux: ["goland"]
  },
  rider: {
    ideKind: "jetbrains",
    displayName: "Rider",
    processKeywordsMac: ["Rider"],
    processKeywordsWindows: ["rider64.exe"],
    processKeywordsLinux: ["rider"]
  },
  datagrip: {
    ideKind: "jetbrains",
    displayName: "DataGrip",
    processKeywordsMac: ["DataGrip"],
    processKeywordsWindows: ["datagrip64.exe"],
    processKeywordsLinux: ["datagrip"]
  },
  appcode: {
    ideKind: "jetbrains",
    displayName: "AppCode",
    processKeywordsMac: ["AppCode"],
    processKeywordsWindows: ["appcode.exe"],
    processKeywordsLinux: ["appcode"]
  },
  dataspell: {
    ideKind: "jetbrains",
    displayName: "DataSpell",
    processKeywordsMac: ["DataSpell"],
    processKeywordsWindows: ["dataspell64.exe"],
    processKeywordsLinux: ["dataspell"]
  },
  aqua: {
    ideKind: "jetbrains",
    displayName: "Aqua",
    processKeywordsMac: [],
    // Do not auto-detect since aqua is too common
    processKeywordsWindows: ["aqua64.exe"],
    processKeywordsLinux: []
  },
  gateway: {
    ideKind: "jetbrains",
    displayName: "Gateway",
    processKeywordsMac: [],
    // Do not auto-detect since gateway is too common
    processKeywordsWindows: ["gateway64.exe"],
    processKeywordsLinux: []
  },
  fleet: {
    ideKind: "jetbrains",
    displayName: "Fleet",
    processKeywordsMac: [],
    // Do not auto-detect since fleet is too common
    processKeywordsWindows: ["fleet.exe"],
    processKeywordsLinux: []
  },
  androidstudio: {
    ideKind: "jetbrains",
    displayName: "Android Studio",
    processKeywordsMac: ["Android Studio"],
    processKeywordsWindows: ["studio64.exe"],
    processKeywordsLinux: ["android-studio"]
  }
};
function isVSCodeIde(ide) {
  if (!ide) return false;
  const config = supportedIdeConfigs[ide];
  return config && config.ideKind === "vscode";
}
function isJetBrainsIde(ide) {
  if (!ide) return false;
  const config = supportedIdeConfigs[ide];
  return config && config.ideKind === "jetbrains";
}
const isSupportedVSCodeTerminal = memoize(() => {
  return isVSCodeIde(env.terminal);
});
const isSupportedJetBrainsTerminal = memoize(() => {
  return isJetBrainsIde(envDynamic.terminal);
});
const isSupportedTerminal = memoize(() => {
  return isSupportedVSCodeTerminal() || isSupportedJetBrainsTerminal() || Boolean(process.env.FORCE_CODE_TERMINAL);
});
function getTerminalIdeType() {
  if (!isSupportedTerminal()) {
    return null;
  }
  return env.terminal;
}
async function getSortedIdeLockfiles() {
  try {
    const ideLockFilePaths = await getIdeLockfilesPaths();
    const allLockfiles = await Promise.all(
      ideLockFilePaths.map(async (ideLockFilePath) => {
        try {
          const entries = await getFsImplementation().readdir(ideLockFilePath);
          const lockEntries = entries.filter(
            (file) => file.name.endsWith(".lock")
          );
          const stats = await Promise.all(
            lockEntries.map(async (file) => {
              const fullPath = join(ideLockFilePath, file.name);
              try {
                const fileStat = await getFsImplementation().stat(fullPath);
                return { path: fullPath, mtime: fileStat.mtime };
              } catch {
                return null;
              }
            })
          );
          return stats.filter((s) => s !== null);
        } catch (error) {
          if (!isFsInaccessible(error)) {
            logError(error);
          }
          return [];
        }
      })
    );
    return allLockfiles.flat().sort((a, b) => b.mtime.getTime() - a.mtime.getTime()).map((file) => file.path);
  } catch (error) {
    logError(error);
    return [];
  }
}
async function readIdeLockfile(path) {
  try {
    const content = await getFsImplementation().readFile(path, {
      encoding: "utf-8"
    });
    let workspaceFolders = [];
    let pid;
    let ideName;
    let useWebSocket = false;
    let runningInWindows = false;
    let authToken;
    try {
      const parsedContent = jsonParse(content);
      if (parsedContent.workspaceFolders) {
        workspaceFolders = parsedContent.workspaceFolders;
      }
      pid = parsedContent.pid;
      ideName = parsedContent.ideName;
      useWebSocket = parsedContent.transport === "ws";
      runningInWindows = parsedContent.runningInWindows === true;
      authToken = parsedContent.authToken;
    } catch (_) {
      workspaceFolders = content.split("\n").map((line) => line.trim());
    }
    const filename = path.split(pathSeparator).pop();
    if (!filename) return null;
    const port = filename.replace(".lock", "");
    return {
      workspaceFolders,
      port: parseInt(port),
      pid,
      ideName,
      useWebSocket,
      runningInWindows,
      authToken
    };
  } catch (error) {
    logError(error);
    return null;
  }
}
async function checkIdeConnection(host, port, timeout = 500) {
  try {
    return new Promise((resolve2) => {
      const socket = createConnection({
        host,
        port,
        timeout
      });
      socket.on("connect", () => {
        socket.destroy();
        void resolve2(true);
      });
      socket.on("error", () => {
        void resolve2(false);
      });
      socket.on("timeout", () => {
        socket.destroy();
        void resolve2(false);
      });
    });
  } catch (_) {
    return false;
  }
}
const getWindowsUserProfile = memoize(async () => {
  if (process.env.USERPROFILE) return process.env.USERPROFILE;
  const { stdout, code } = await execFileNoThrow("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "$env:USERPROFILE"
  ]);
  if (code === 0 && stdout.trim()) return stdout.trim();
  logForDebugging(
    "Unable to get Windows USERPROFILE via PowerShell - IDE detection may be incomplete"
  );
  return void 0;
});
async function getIdeLockfilesPaths() {
  const paths = [join(getClaudeConfigHomeDir(), "ide")];
  if (getPlatform() !== "wsl") {
    return paths;
  }
  const windowsHome = await getWindowsUserProfile();
  if (windowsHome) {
    const converter = new WindowsToWSLConverter(process.env.WSL_DISTRO_NAME);
    const wslPath = converter.toLocalPath(windowsHome);
    paths.push(resolve(wslPath, ".claude", "ide"));
  }
  try {
    const usersDir = "/mnt/c/Users";
    const userDirs = await getFsImplementation().readdir(usersDir);
    for (const user of userDirs) {
      if (!user.isDirectory() && !user.isSymbolicLink()) {
        continue;
      }
      if (user.name === "Public" || user.name === "Default" || user.name === "Default User" || user.name === "All Users") {
        continue;
      }
      paths.push(join(usersDir, user.name, ".claude", "ide"));
    }
  } catch (error) {
    if (isFsInaccessible(error)) {
      logForDebugging(
        `WSL IDE lockfile path detection failed (${error.code}): ${errorMessage(error)}`
      );
    } else {
      logError(error);
    }
  }
  return paths;
}
async function cleanupStaleIdeLockfiles() {
  try {
    const lockfiles = await getSortedIdeLockfiles();
    for (const lockfilePath of lockfiles) {
      const lockfileInfo = await readIdeLockfile(lockfilePath);
      if (!lockfileInfo) {
        try {
          await getFsImplementation().unlink(lockfilePath);
        } catch (error) {
          logError(error);
        }
        continue;
      }
      const host = await detectHostIP(
        lockfileInfo.runningInWindows,
        lockfileInfo.port
      );
      let shouldDelete = false;
      if (lockfileInfo.pid) {
        if (!isProcessRunning(lockfileInfo.pid)) {
          if (getPlatform() !== "wsl") {
            shouldDelete = true;
          } else {
            const isResponding = await checkIdeConnection(
              host,
              lockfileInfo.port
            );
            if (!isResponding) {
              shouldDelete = true;
            }
          }
        }
      } else {
        const isResponding = await checkIdeConnection(host, lockfileInfo.port);
        if (!isResponding) {
          shouldDelete = true;
        }
      }
      if (shouldDelete) {
        try {
          await getFsImplementation().unlink(lockfilePath);
        } catch (error) {
          logError(error);
        }
      }
    }
  } catch (error) {
    logError(error);
  }
}
async function maybeInstallIDEExtension(ideType) {
  try {
    const installedVersion = await installIDEExtension(ideType);
    logEvent("tengu_ext_installed", {});
    const globalConfig = getGlobalConfig();
    if (!globalConfig.diffTool) {
      saveGlobalConfig((current) => ({ ...current, diffTool: "auto" }));
    }
    return {
      installed: true,
      error: null,
      installedVersion,
      ideType
    };
  } catch (error) {
    logEvent("tengu_ext_install_error", {});
    const errorMessage2 = error instanceof Error ? error.message : String(error);
    logError(error);
    return {
      installed: false,
      error: errorMessage2,
      installedVersion: null,
      ideType
    };
  }
}
let currentIDESearch = null;
async function findAvailableIDE() {
  if (currentIDESearch) {
    currentIDESearch.abort();
  }
  currentIDESearch = createAbortController();
  const signal = currentIDESearch.signal;
  await cleanupStaleIdeLockfiles();
  const startTime = Date.now();
  while (Date.now() - startTime < 3e4 && !signal.aborted) {
    if (getIsScrollDraining()) {
      await sleep(1e3, signal);
      continue;
    }
    const ides = await detectIDEs(false);
    if (signal.aborted) {
      return null;
    }
    if (ides.length === 1) {
      return ides[0];
    }
    await sleep(1e3, signal);
  }
  return null;
}
async function detectIDEs(includeInvalid) {
  const detectedIDEs = [];
  try {
    const ssePort = process.env.CLAUDE_CODE_SSE_PORT;
    const envPort = ssePort ? parseInt(ssePort) : null;
    const cwd = getOriginalCwd().normalize("NFC");
    const lockfiles = await getSortedIdeLockfiles();
    const lockfileInfos = await Promise.all(lockfiles.map(readIdeLockfile));
    const getAncestors = makeAncestorPidLookup();
    const needsAncestryCheck = getPlatform() !== "wsl" && isSupportedTerminal();
    for (const lockfileInfo of lockfileInfos) {
      if (!lockfileInfo) continue;
      let isValid = false;
      if (isEnvTruthy(process.env.CLAUDE_CODE_IDE_SKIP_VALID_CHECK)) {
        isValid = true;
      } else if (lockfileInfo.port === envPort) {
        isValid = true;
      } else {
        isValid = lockfileInfo.workspaceFolders.some((idePath) => {
          if (!idePath) return false;
          let localPath = idePath;
          if (getPlatform() === "wsl" && lockfileInfo.runningInWindows && process.env.WSL_DISTRO_NAME) {
            if (!checkWSLDistroMatch(idePath, process.env.WSL_DISTRO_NAME)) {
              return false;
            }
            const resolvedOriginal = resolve(localPath).normalize("NFC");
            if (cwd === resolvedOriginal || cwd.startsWith(resolvedOriginal + pathSeparator)) {
              return true;
            }
            const converter = new WindowsToWSLConverter(
              process.env.WSL_DISTRO_NAME
            );
            localPath = converter.toLocalPath(idePath);
          }
          const resolvedPath = resolve(localPath).normalize("NFC");
          if (getPlatform() === "windows") {
            const normalizedCwd = cwd.replace(
              /^[a-zA-Z]:/,
              (match) => match.toUpperCase()
            );
            const normalizedResolvedPath = resolvedPath.replace(
              /^[a-zA-Z]:/,
              (match) => match.toUpperCase()
            );
            return normalizedCwd === normalizedResolvedPath || normalizedCwd.startsWith(normalizedResolvedPath + pathSeparator);
          }
          return cwd === resolvedPath || cwd.startsWith(resolvedPath + pathSeparator);
        });
      }
      if (!isValid && !includeInvalid) {
        continue;
      }
      if (needsAncestryCheck) {
        const portMatchesEnv = envPort !== null && lockfileInfo.port === envPort;
        if (!portMatchesEnv) {
          if (!lockfileInfo.pid || !isProcessRunning(lockfileInfo.pid)) {
            continue;
          }
          if (process.ppid !== lockfileInfo.pid) {
            const ancestors = await getAncestors();
            if (!ancestors.has(lockfileInfo.pid)) {
              continue;
            }
          }
        }
      }
      const ideName = lockfileInfo.ideName ?? (isSupportedTerminal() ? toIDEDisplayName(envDynamic.terminal) : "IDE");
      const host = await detectHostIP(
        lockfileInfo.runningInWindows,
        lockfileInfo.port
      );
      let url;
      if (lockfileInfo.useWebSocket) {
        url = `ws://${host}:${lockfileInfo.port}`;
      } else {
        url = `http://${host}:${lockfileInfo.port}/sse`;
      }
      detectedIDEs.push({
        url,
        name: ideName,
        workspaceFolders: lockfileInfo.workspaceFolders,
        port: lockfileInfo.port,
        isValid,
        authToken: lockfileInfo.authToken,
        ideRunningInWindows: lockfileInfo.runningInWindows
      });
    }
    if (!includeInvalid && envPort) {
      const envPortMatch = detectedIDEs.filter(
        (ide) => ide.isValid && ide.port === envPort
      );
      if (envPortMatch.length === 1) {
        return envPortMatch;
      }
    }
  } catch (error) {
    logError(error);
  }
  return detectedIDEs;
}
async function maybeNotifyIDEConnected(client) {
  await client.notification({
    method: "ide_connected",
    params: {
      pid: process.pid
    }
  });
}
function hasAccessToIDEExtensionDiffFeature(mcpClients) {
  return mcpClients.some(
    (client) => client.type === "connected" && client.name === "ide"
  );
}
const EXTENSION_ID = process.env.USER_TYPE === "ant" ? "anthropic.claude-code-internal" : "anthropic.claude-code";
async function isIDEExtensionInstalled(ideType) {
  if (isVSCodeIde(ideType)) {
    const command = await getVSCodeIDECommand(ideType);
    if (command) {
      try {
        const result = await execFileNoThrowWithCwd(
          command,
          ["--list-extensions"],
          {
            env: getInstallationEnv()
          }
        );
        if (result.stdout?.includes(EXTENSION_ID)) {
          return true;
        }
      } catch {
      }
    }
  } else if (isJetBrainsIde(ideType)) {
    return await isJetBrainsPluginInstalledCached(ideType);
  }
  return false;
}
async function installIDEExtension(ideType) {
  if (isVSCodeIde(ideType)) {
    const command = await getVSCodeIDECommand(ideType);
    if (command) {
      if (process.env.USER_TYPE === "ant") {
        return await installFromArtifactory(command);
      }
      let version = await getInstalledVSCodeExtensionVersion(command);
      if (!version || lt(version, getClaudeCodeVersion())) {
        await sleep(500);
        const result = await execFileNoThrowWithCwd(
          command,
          ["--force", "--install-extension", "anthropic.claude-code"],
          {
            env: getInstallationEnv()
          }
        );
        if (result.code !== 0) {
          throw new Error(`${result.code}: ${result.error} ${result.stderr}`);
        }
        version = getClaudeCodeVersion();
      }
      return version;
    }
  }
  return null;
}
function getInstallationEnv() {
  if (getPlatform() === "linux") {
    return {
      ...process.env,
      DISPLAY: ""
    };
  }
  return void 0;
}
function getClaudeCodeVersion() {
  return "0.0.0-dev";
}
async function getInstalledVSCodeExtensionVersion(command) {
  const { stdout } = await execFileNoThrow(
    command,
    ["--list-extensions", "--show-versions"],
    {
      env: getInstallationEnv()
    }
  );
  const lines = stdout?.split("\n") || [];
  for (const line of lines) {
    const [extensionId, version] = line.split("@");
    if (extensionId === "anthropic.claude-code" && version) {
      return version;
    }
  }
  return null;
}
function getVSCodeIDECommandByParentProcess() {
  try {
    const platform = getPlatform();
    if (platform !== "macos") {
      return null;
    }
    let pid = process.ppid;
    for (let i = 0; i < 10; i++) {
      if (!pid || pid === 0 || pid === 1) break;
      const command = execSyncWithDefaults_DEPRECATED(
        // eslint-disable-next-line custom-rules/no-direct-ps-commands
        `ps -o command= -p ${pid}`
      )?.trim();
      if (command) {
        const appNames = {
          "Visual Studio Code.app": "code",
          "Cursor.app": "cursor",
          "Windsurf.app": "windsurf",
          "Visual Studio Code - Insiders.app": "code",
          "VSCodium.app": "codium"
        };
        const pathToExecutable = "/Contents/MacOS/Electron";
        for (const [appName, executableName] of Object.entries(appNames)) {
          const appIndex = command.indexOf(appName + pathToExecutable);
          if (appIndex !== -1) {
            const folderPathEnd = appIndex + appName.length;
            return command.substring(0, folderPathEnd) + "/Contents/Resources/app/bin/" + executableName;
          }
        }
      }
      const ppidStr = execSyncWithDefaults_DEPRECATED(
        // eslint-disable-next-line custom-rules/no-direct-ps-commands
        `ps -o ppid= -p ${pid}`
      )?.trim();
      if (!ppidStr) {
        break;
      }
      pid = parseInt(ppidStr.trim());
    }
    return null;
  } catch {
    return null;
  }
}
async function getVSCodeIDECommand(ideType) {
  const parentExecutable = getVSCodeIDECommandByParentProcess();
  if (parentExecutable) {
    try {
      await getFsImplementation().stat(parentExecutable);
      return parentExecutable;
    } catch {
    }
  }
  const ext = getPlatform() === "windows" ? ".cmd" : "";
  switch (ideType) {
    case "vscode":
      return "code" + ext;
    case "cursor":
      return "cursor" + ext;
    case "windsurf":
      return "windsurf" + ext;
    default:
      break;
  }
  return null;
}
async function isCursorInstalled() {
  const result = await execFileNoThrow("cursor", ["--version"]);
  return result.code === 0;
}
async function isWindsurfInstalled() {
  const result = await execFileNoThrow("windsurf", ["--version"]);
  return result.code === 0;
}
async function isVSCodeInstalled() {
  const result = await execFileNoThrow("code", ["--help"]);
  return result.code === 0 && Boolean(result.stdout?.includes("Visual Studio Code"));
}
let cachedRunningIDEs = null;
async function detectRunningIDEsImpl() {
  const runningIDEs = [];
  try {
    const platform = getPlatform();
    if (platform === "macos") {
      const result = await execa(
        'ps aux | grep -E "Visual Studio Code|Code Helper|Cursor Helper|Windsurf Helper|IntelliJ IDEA|PyCharm|WebStorm|PhpStorm|RubyMine|CLion|GoLand|Rider|DataGrip|AppCode|DataSpell|Aqua|Gateway|Fleet|Android Studio" | grep -v grep',
        { shell: true, reject: false }
      );
      const stdout = result.stdout ?? "";
      for (const [ide, config] of Object.entries(supportedIdeConfigs)) {
        for (const keyword of config.processKeywordsMac) {
          if (stdout.includes(keyword)) {
            runningIDEs.push(ide);
            break;
          }
        }
      }
    } else if (platform === "windows") {
      const result = await execa(
        'tasklist | findstr /I "Code.exe Cursor.exe Windsurf.exe idea64.exe pycharm64.exe webstorm64.exe phpstorm64.exe rubymine64.exe clion64.exe goland64.exe rider64.exe datagrip64.exe appcode.exe dataspell64.exe aqua64.exe gateway64.exe fleet.exe studio64.exe"',
        { shell: true, reject: false }
      );
      const stdout = result.stdout ?? "";
      const normalizedStdout = stdout.toLowerCase();
      for (const [ide, config] of Object.entries(supportedIdeConfigs)) {
        for (const keyword of config.processKeywordsWindows) {
          if (normalizedStdout.includes(keyword.toLowerCase())) {
            runningIDEs.push(ide);
            break;
          }
        }
      }
    } else if (platform === "linux") {
      const result = await execa(
        'ps aux | grep -E "code|cursor|windsurf|idea|pycharm|webstorm|phpstorm|rubymine|clion|goland|rider|datagrip|dataspell|aqua|gateway|fleet|android-studio" | grep -v grep',
        { shell: true, reject: false }
      );
      const stdout = result.stdout ?? "";
      const normalizedStdout = stdout.toLowerCase();
      for (const [ide, config] of Object.entries(supportedIdeConfigs)) {
        for (const keyword of config.processKeywordsLinux) {
          if (normalizedStdout.includes(keyword)) {
            if (ide !== "vscode") {
              runningIDEs.push(ide);
              break;
            } else if (!normalizedStdout.includes("cursor") && !normalizedStdout.includes("appcode")) {
              runningIDEs.push(ide);
              break;
            }
          }
        }
      }
    }
  } catch (error) {
    logError(error);
  }
  return runningIDEs;
}
async function detectRunningIDEs() {
  const result = await detectRunningIDEsImpl();
  cachedRunningIDEs = result;
  return result;
}
async function detectRunningIDEsCached() {
  if (cachedRunningIDEs === null) {
    return detectRunningIDEs();
  }
  return cachedRunningIDEs;
}
function resetDetectRunningIDEs() {
  cachedRunningIDEs = null;
}
function getConnectedIdeName(mcpClients) {
  const ideClient = mcpClients.find(
    (client) => client.type === "connected" && client.name === "ide"
  );
  return getIdeClientName(ideClient);
}
function getIdeClientName(ideClient) {
  const config = ideClient?.config;
  return config?.type === "sse-ide" || config?.type === "ws-ide" ? config.ideName : isSupportedTerminal() ? toIDEDisplayName(envDynamic.terminal) : null;
}
const EDITOR_DISPLAY_NAMES = {
  code: "VS Code",
  cursor: "Cursor",
  windsurf: "Windsurf",
  antigravity: "Antigravity",
  vi: "Vim",
  vim: "Vim",
  nano: "nano",
  notepad: "Notepad",
  "start /wait notepad": "Notepad",
  emacs: "Emacs",
  subl: "Sublime Text",
  atom: "Atom"
};
function toIDEDisplayName(terminal) {
  if (!terminal) return "IDE";
  const config = supportedIdeConfigs[terminal];
  if (config) {
    return config.displayName;
  }
  const editorName = EDITOR_DISPLAY_NAMES[terminal.toLowerCase().trim()];
  if (editorName) {
    return editorName;
  }
  const command = terminal.split(" ")[0];
  const commandName = command ? basename(command).toLowerCase() : null;
  if (commandName) {
    const mappedName = EDITOR_DISPLAY_NAMES[commandName];
    if (mappedName) {
      return mappedName;
    }
    return capitalize(commandName);
  }
  return capitalize(terminal);
}
function getConnectedIdeClient(mcpClients) {
  if (!mcpClients) {
    return void 0;
  }
  const ideClient = mcpClients.find(
    (client) => client.type === "connected" && client.name === "ide"
  );
  return ideClient?.type === "connected" ? ideClient : void 0;
}
async function closeOpenDiffs(ideClient) {
  try {
    await callIdeRpc("closeAllDiffTabs", {}, ideClient);
  } catch (_) {
  }
}
async function initializeIdeIntegration(onIdeDetected, ideToInstallExtension, onShowIdeOnboarding, onInstallationComplete) {
  void findAvailableIDE().then(onIdeDetected);
  const shouldAutoInstall = getGlobalConfig().autoInstallIdeExtension ?? true;
  if (!isEnvTruthy(process.env.CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL) && shouldAutoInstall) {
    const ideType = ideToInstallExtension ?? getTerminalIdeType();
    if (ideType) {
      if (isVSCodeIde(ideType)) {
        void isIDEExtensionInstalled(ideType).then(async (isAlreadyInstalled) => {
          void maybeInstallIDEExtension(ideType).catch((error) => {
            const ideInstallationStatus = {
              installed: false,
              error: error.message || "Installation failed",
              installedVersion: null,
              ideType
            };
            return ideInstallationStatus;
          }).then((status) => {
            onInstallationComplete(status);
            if (status?.installed) {
              void findAvailableIDE().then(onIdeDetected);
            }
            if (!isAlreadyInstalled && status?.installed === true && !ideOnboardingDialog().hasIdeOnboardingDialogBeenShown()) {
              onShowIdeOnboarding();
            }
          });
        });
      } else if (isJetBrainsIde(ideType)) {
        void isIDEExtensionInstalled(ideType).then(async (installed) => {
          if (installed && !ideOnboardingDialog().hasIdeOnboardingDialogBeenShown()) {
            onShowIdeOnboarding();
          }
        });
      }
    }
  }
}
const detectHostIP = memoize(
  async (isIdeRunningInWindows, port) => {
    if (process.env.CLAUDE_CODE_IDE_HOST_OVERRIDE) {
      return process.env.CLAUDE_CODE_IDE_HOST_OVERRIDE;
    }
    if (getPlatform() !== "wsl" || !isIdeRunningInWindows) {
      return "127.0.0.1";
    }
    try {
      const routeResult = await execa("ip route show | grep -i default", {
        shell: true,
        reject: false
      });
      if (routeResult.exitCode === 0 && routeResult.stdout) {
        const gatewayMatch = routeResult.stdout.match(
          /default via (\d+\.\d+\.\d+\.\d+)/
        );
        if (gatewayMatch) {
          const gatewayIP = gatewayMatch[1];
          if (await checkIdeConnection(gatewayIP, port)) {
            return gatewayIP;
          }
        }
      }
    } catch (_) {
    }
    return "127.0.0.1";
  },
  (isIdeRunningInWindows, port) => `${isIdeRunningInWindows}:${port}`
);
async function installFromArtifactory(command) {
  const npmrcPath = join(os.homedir(), ".npmrc");
  let authToken = null;
  const fs = getFsImplementation();
  try {
    const npmrcContent = await fs.readFile(npmrcPath, {
      encoding: "utf8"
    });
    const lines = npmrcContent.split("\n");
    for (const line of lines) {
      const match = line.match(
        /\/\/artifactory\.infra\.ant\.dev\/artifactory\/api\/npm\/npm-all\/:_authToken=(.+)/
      );
      if (match && match[1]) {
        authToken = match[1].trim();
        break;
      }
    }
  } catch (error) {
    logError(error);
    throw new Error(`Failed to read npm authentication: ${error}`);
  }
  if (!authToken) {
    throw new Error("No artifactory auth token found in ~/.npmrc");
  }
  const versionUrl = "https://artifactory.infra.ant.dev/artifactory/armorcode-claude-code-internal/claude-vscode-releases/stable";
  try {
    const versionResponse = await axios.get(versionUrl, {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });
    const version = versionResponse.data.trim();
    if (!version) {
      throw new Error("No version found in artifactory response");
    }
    const vsixUrl = `https://artifactory.infra.ant.dev/artifactory/armorcode-claude-code-internal/claude-vscode-releases/${version}/claude-code.vsix`;
    const tempVsixPath = join(
      os.tmpdir(),
      `claude-code-${version}-${Date.now()}.vsix`
    );
    try {
      const vsixResponse = await axios.get(vsixUrl, {
        headers: {
          Authorization: `Bearer ${authToken}`
        },
        responseType: "stream"
      });
      const writeStream = getFsImplementation().createWriteStream(tempVsixPath);
      await new Promise((resolve2, reject) => {
        vsixResponse.data.pipe(writeStream);
        writeStream.on("finish", resolve2);
        writeStream.on("error", reject);
      });
      await sleep(500);
      const result = await execFileNoThrowWithCwd(
        command,
        ["--force", "--install-extension", tempVsixPath],
        {
          env: getInstallationEnv()
        }
      );
      if (result.code !== 0) {
        throw new Error(`${result.code}: ${result.error} ${result.stderr}`);
      }
      return version;
    } finally {
      try {
        await fs.unlink(tempVsixPath);
      } catch {
      }
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        `Failed to fetch extension version from artifactory: ${error.message}`
      );
    }
    throw error;
  }
}
export {
  callIdeRpc,
  cleanupStaleIdeLockfiles,
  closeOpenDiffs,
  detectIDEs,
  detectRunningIDEs,
  detectRunningIDEsCached,
  findAvailableIDE,
  getConnectedIdeClient,
  getConnectedIdeName,
  getIdeClientName,
  getIdeLockfilesPaths,
  getSortedIdeLockfiles,
  getTerminalIdeType,
  hasAccessToIDEExtensionDiffFeature,
  initializeIdeIntegration,
  isCursorInstalled,
  isIDEExtensionInstalled,
  isJetBrainsIde,
  isSupportedJetBrainsTerminal,
  isSupportedTerminal,
  isSupportedVSCodeTerminal,
  isVSCodeIde,
  isVSCodeInstalled,
  isWindsurfInstalled,
  maybeInstallIDEExtension,
  maybeNotifyIDEConnected,
  resetDetectRunningIDEs,
  toIDEDisplayName
};
