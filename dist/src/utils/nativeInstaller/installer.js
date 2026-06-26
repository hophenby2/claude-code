import { constants as fsConstants } from "fs";
import {
  access,
  chmod,
  copyFile,
  lstat,
  mkdir,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  symlink,
  unlink,
  writeFile
} from "fs/promises";
import { homedir } from "os";
import { basename, delimiter, dirname, join, resolve } from "path";
import {
  logEvent
} from "../../services/analytics/index.js";
import { getMaxVersion, shouldSkipVersion } from "../autoUpdater.js";
import { registerCleanup } from "../cleanupRegistry.js";
import { getGlobalConfig, saveGlobalConfig } from "../config.js";
import { logForDebugging } from "../debug.js";
import { getCurrentInstallationType } from "../doctorDiagnostic.js";
import { env } from "../env.js";
import { envDynamic } from "../envDynamic.js";
import { isEnvTruthy } from "../envUtils.js";
import { errorMessage, getErrnoCode, isENOENT, toError } from "../errors.js";
import { execFileNoThrowWithCwd } from "../execFileNoThrow.js";
import { getShellType } from "../localInstaller.js";
import * as lockfile from "../lockfile.js";
import { logError } from "../log.js";
import { gt, gte } from "../semver.js";
import {
  filterClaudeAliases,
  getShellConfigPaths,
  readFileLines,
  writeFileLines
} from "../shellConfig.js";
import { sleep } from "../sleep.js";
import {
  getUserBinDir,
  getXDGCacheHome,
  getXDGDataHome,
  getXDGStateHome
} from "../xdg.js";
import { downloadVersion, getLatestVersion } from "./download.js";
import {
  acquireProcessLifetimeLock,
  cleanupStaleLocks,
  isLockActive,
  isPidBasedLockingEnabled,
  readLockContent,
  withLock
} from "./pidLock.js";
const VERSION_RETENTION_COUNT = 2;
const LOCK_STALE_MS = 7 * 24 * 60 * 60 * 1e3;
function getPlatform() {
  const os = env.platform;
  const arch = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : null;
  if (!arch) {
    const error = new Error(`Unsupported architecture: ${process.arch}`);
    logForDebugging(
      `Native installer does not support architecture: ${process.arch}`,
      { level: "error" }
    );
    throw error;
  }
  if (os === "linux" && envDynamic.isMuslEnvironment()) {
    return `linux-${arch}-musl`;
  }
  return `${os}-${arch}`;
}
function getBinaryName(platform) {
  return platform.startsWith("win32") ? "claude.exe" : "claude";
}
function getBaseDirectories() {
  const platform = getPlatform();
  const executableName = getBinaryName(platform);
  return {
    // Data directories (permanent storage)
    versions: join(getXDGDataHome(), "claude", "versions"),
    // Cache directories (can be deleted)
    staging: join(getXDGCacheHome(), "claude", "staging"),
    // State directories
    locks: join(getXDGStateHome(), "claude", "locks"),
    // User bin
    executable: join(getUserBinDir(), executableName)
  };
}
async function isPossibleClaudeBinary(filePath) {
  try {
    const stats = await stat(filePath);
    if (!stats.isFile() || stats.size === 0) {
      return false;
    }
    await access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}
async function getVersionPaths(version) {
  const dirs = getBaseDirectories();
  const dirsToCreate = [dirs.versions, dirs.staging, dirs.locks];
  await Promise.all(dirsToCreate.map((dir) => mkdir(dir, { recursive: true })));
  const executableParentDir = dirname(dirs.executable);
  await mkdir(executableParentDir, { recursive: true });
  const installPath = join(dirs.versions, version);
  try {
    await stat(installPath);
  } catch {
    await writeFile(installPath, "", { encoding: "utf8" });
  }
  return {
    stagingPath: join(dirs.staging, version),
    installPath
  };
}
async function tryWithVersionLock(versionFilePath, callback, retries = 0) {
  const dirs = getBaseDirectories();
  const lockfilePath = getLockFilePathFromVersionPath(dirs, versionFilePath);
  await mkdir(dirs.locks, { recursive: true });
  if (isPidBasedLockingEnabled()) {
    let attempts = 0;
    const maxAttempts = retries + 1;
    const minTimeout = retries > 0 ? 1e3 : 100;
    const maxTimeout = retries > 0 ? 5e3 : 500;
    while (attempts < maxAttempts) {
      const success = await withLock(
        versionFilePath,
        lockfilePath,
        async () => {
          try {
            await callback();
          } catch (error) {
            logError(error);
            throw error;
          }
        }
      );
      if (success) {
        logEvent("tengu_version_lock_acquired", {
          is_pid_based: true,
          is_lifetime_lock: false,
          attempts: attempts + 1
        });
        return true;
      }
      attempts++;
      if (attempts < maxAttempts) {
        const timeout = Math.min(
          minTimeout * Math.pow(2, attempts - 1),
          maxTimeout
        );
        await sleep(timeout);
      }
    }
    logEvent("tengu_version_lock_failed", {
      is_pid_based: true,
      is_lifetime_lock: false,
      attempts: maxAttempts
    });
    logLockAcquisitionError(
      versionFilePath,
      new Error("Lock held by another process")
    );
    return false;
  }
  let release = null;
  try {
    try {
      release = await lockfile.lock(versionFilePath, {
        stale: LOCK_STALE_MS,
        retries: {
          retries,
          minTimeout: retries > 0 ? 1e3 : 100,
          maxTimeout: retries > 0 ? 5e3 : 500
        },
        lockfilePath,
        // Handle lock compromise gracefully to prevent unhandled rejections
        // This can happen if another process deletes the lock directory while we hold it
        onCompromised: (err) => {
          logForDebugging(
            `NON-FATAL: Version lock was compromised during operation: ${err.message}`,
            { level: "info" }
          );
        }
      });
    } catch (lockError) {
      logEvent("tengu_version_lock_failed", {
        is_pid_based: false,
        is_lifetime_lock: false
      });
      logLockAcquisitionError(versionFilePath, lockError);
      return false;
    }
    try {
      await callback();
      logEvent("tengu_version_lock_acquired", {
        is_pid_based: false,
        is_lifetime_lock: false
      });
      return true;
    } catch (error) {
      logError(error);
      throw error;
    }
  } finally {
    if (release) {
      await release();
    }
  }
}
async function atomicMoveToInstallPath(stagedBinaryPath, installPath) {
  await mkdir(dirname(installPath), { recursive: true });
  const tempInstallPath = `${installPath}.tmp.${process.pid}.${Date.now()}`;
  try {
    await copyFile(stagedBinaryPath, tempInstallPath);
    await chmod(tempInstallPath, 493);
    await rename(tempInstallPath, installPath);
    logForDebugging(`Atomically installed binary to ${installPath}`);
  } catch (error) {
    try {
      await unlink(tempInstallPath);
    } catch {
    }
    throw error;
  }
}
async function installVersionFromPackage(stagingPath, installPath) {
  try {
    const nodeModulesDir = join(stagingPath, "node_modules", "@anthropic-ai");
    const entries = await readdir(nodeModulesDir);
    const nativePackage = entries.find(
      (entry) => entry.startsWith("claude-cli-native-")
    );
    if (!nativePackage) {
      logEvent("tengu_native_install_package_failure", {
        stage_find_package: true,
        error_package_not_found: true
      });
      const error = new Error("Could not find platform-specific native package");
      throw error;
    }
    const stagedBinaryPath = join(nodeModulesDir, nativePackage, "cli");
    try {
      await stat(stagedBinaryPath);
    } catch {
      logEvent("tengu_native_install_package_failure", {
        stage_binary_exists: true,
        error_binary_not_found: true
      });
      const error = new Error("Native binary not found in staged package");
      throw error;
    }
    await atomicMoveToInstallPath(stagedBinaryPath, installPath);
    await rm(stagingPath, { recursive: true, force: true });
    logEvent("tengu_native_install_package_success", {});
  } catch (error) {
    const msg = errorMessage(error);
    if (!msg.includes("Could not find platform-specific") && !msg.includes("Native binary not found")) {
      logEvent("tengu_native_install_package_failure", {
        stage_atomic_move: true,
        error_move_failed: true
      });
    }
    logError(toError(error));
    throw error;
  }
}
async function installVersionFromBinary(stagingPath, installPath) {
  try {
    const platform = getPlatform();
    const binaryName = getBinaryName(platform);
    const stagedBinaryPath = join(stagingPath, binaryName);
    try {
      await stat(stagedBinaryPath);
    } catch {
      logEvent("tengu_native_install_binary_failure", {
        stage_binary_exists: true,
        error_binary_not_found: true
      });
      const error = new Error("Staged binary not found");
      throw error;
    }
    await atomicMoveToInstallPath(stagedBinaryPath, installPath);
    await rm(stagingPath, { recursive: true, force: true });
    logEvent("tengu_native_install_binary_success", {});
  } catch (error) {
    if (!errorMessage(error).includes("Staged binary not found")) {
      logEvent("tengu_native_install_binary_failure", {
        stage_atomic_move: true,
        error_move_failed: true
      });
    }
    logError(toError(error));
    throw error;
  }
}
async function installVersion(stagingPath, installPath, downloadType) {
  if (downloadType === "npm") {
    await installVersionFromPackage(stagingPath, installPath);
  } else {
    await installVersionFromBinary(stagingPath, installPath);
  }
}
async function performVersionUpdate(version, forceReinstall) {
  const { stagingPath: baseStagingPath, installPath } = await getVersionPaths(version);
  const { executable: executablePath } = getBaseDirectories();
  const stagingPath = isEnvTruthy(process.env.ENABLE_LOCKLESS_UPDATES) ? `${baseStagingPath}.${process.pid}.${Date.now()}` : baseStagingPath;
  const needsInstall = !await versionIsAvailable(version) || forceReinstall;
  if (needsInstall) {
    logForDebugging(
      forceReinstall ? `Force reinstalling native installer version ${version}` : `Downloading native installer version ${version}`
    );
    const downloadType = await downloadVersion(version, stagingPath);
    await installVersion(stagingPath, installPath, downloadType);
  } else {
    logForDebugging(`Version ${version} already installed, updating symlink`);
  }
  await removeDirectoryIfEmpty(executablePath);
  await updateSymlink(executablePath, installPath);
  if (!await isPossibleClaudeBinary(executablePath)) {
    let installPathExists = false;
    try {
      await stat(installPath);
      installPathExists = true;
    } catch {
    }
    throw new Error(
      `Failed to create executable at ${executablePath}. Source file exists: ${installPathExists}. Check write permissions to ${executablePath}.`
    );
  }
  return needsInstall;
}
async function versionIsAvailable(version) {
  const { installPath } = await getVersionPaths(version);
  return isPossibleClaudeBinary(installPath);
}
async function updateLatest(channelOrVersion, forceReinstall = false) {
  const startTime = Date.now();
  let version = await getLatestVersion(channelOrVersion);
  const { executable: executablePath } = getBaseDirectories();
  logForDebugging(`Checking for native installer update to version ${version}`);
  if (!forceReinstall) {
    const maxVersion = await getMaxVersion();
    if (maxVersion && gt(version, maxVersion)) {
      logForDebugging(
        `Native installer: maxVersion ${maxVersion} is set, capping update from ${version} to ${maxVersion}`
      );
      if (gte("0.0.0", maxVersion)) {
        logForDebugging(
          `Native installer: current version ${"0.0.0"} is already at or above maxVersion ${maxVersion}, skipping update`
        );
        logEvent("tengu_native_update_skipped_max_version", {
          latency_ms: Date.now() - startTime,
          max_version: maxVersion,
          available_version: version
        });
        return { success: true, latestVersion: version };
      }
      version = maxVersion;
    }
  }
  if (!forceReinstall && version === "0.0.0" && await versionIsAvailable(version) && await isPossibleClaudeBinary(executablePath)) {
    logForDebugging(`Found ${version} at ${executablePath}, skipping install`);
    logEvent("tengu_native_update_complete", {
      latency_ms: Date.now() - startTime,
      was_new_install: false,
      was_force_reinstall: false,
      was_already_running: true
    });
    return { success: true, latestVersion: version };
  }
  if (!forceReinstall && shouldSkipVersion(version)) {
    logEvent("tengu_native_update_skipped_minimum_version", {
      latency_ms: Date.now() - startTime,
      target_version: version
    });
    return { success: true, latestVersion: version };
  }
  let wasNewInstall = false;
  let latencyMs;
  if (isEnvTruthy(process.env.ENABLE_LOCKLESS_UPDATES)) {
    wasNewInstall = await performVersionUpdate(version, forceReinstall);
    latencyMs = Date.now() - startTime;
  } else {
    const { installPath } = await getVersionPaths(version);
    if (forceReinstall) {
      await forceRemoveLock(installPath);
    }
    const lockAcquired = await tryWithVersionLock(
      installPath,
      async () => {
        wasNewInstall = await performVersionUpdate(version, forceReinstall);
      },
      3
      // retries
    );
    latencyMs = Date.now() - startTime;
    if (!lockAcquired) {
      const dirs = getBaseDirectories();
      let lockHolderPid;
      if (isPidBasedLockingEnabled()) {
        const lockfilePath = getLockFilePathFromVersionPath(dirs, installPath);
        if (isLockActive(lockfilePath)) {
          lockHolderPid = readLockContent(lockfilePath)?.pid;
        }
      }
      logEvent("tengu_native_update_lock_failed", {
        latency_ms: latencyMs,
        lock_holder_pid: lockHolderPid
      });
      return {
        success: false,
        latestVersion: version,
        lockFailed: true,
        lockHolderPid
      };
    }
  }
  logEvent("tengu_native_update_complete", {
    latency_ms: latencyMs,
    was_new_install: wasNewInstall,
    was_force_reinstall: forceReinstall
  });
  logForDebugging(`Successfully updated to version ${version}`);
  return { success: true, latestVersion: version };
}
async function removeDirectoryIfEmpty(path) {
  try {
    await rmdir(path);
    logForDebugging(`Removed empty directory at ${path}`);
  } catch (error) {
    const code = getErrnoCode(error);
    if (code !== "ENOTDIR" && code !== "ENOENT" && code !== "ENOTEMPTY") {
      logForDebugging(`Could not remove directory at ${path}: ${error}`);
    }
  }
}
async function updateSymlink(symlinkPath, targetPath) {
  const platform = getPlatform();
  const isWindows = platform.startsWith("win32");
  if (isWindows) {
    try {
      const parentDir2 = dirname(symlinkPath);
      await mkdir(parentDir2, { recursive: true });
      let existingStats;
      try {
        existingStats = await stat(symlinkPath);
      } catch {
      }
      if (existingStats) {
        try {
          const targetStats = await stat(targetPath);
          if (existingStats.size === targetStats.size) {
            return false;
          }
        } catch {
        }
        const oldFileName = `${symlinkPath}.old.${Date.now()}`;
        await rename(symlinkPath, oldFileName);
        try {
          await copyFile(targetPath, symlinkPath);
          try {
            await unlink(oldFileName);
          } catch {
          }
        } catch (copyError) {
          try {
            await rename(oldFileName, symlinkPath);
          } catch (restoreError) {
            const errorWithCause = new Error(
              `Failed to restore old executable: ${restoreError}`,
              { cause: copyError }
            );
            logError(errorWithCause);
            throw errorWithCause;
          }
          throw copyError;
        }
      } else {
        try {
          await copyFile(targetPath, symlinkPath);
        } catch (e) {
          if (isENOENT(e)) {
            throw new Error(`Source file does not exist: ${targetPath}`);
          }
          throw e;
        }
      }
      return true;
    } catch (error) {
      logError(
        new Error(
          `Failed to copy executable from ${targetPath} to ${symlinkPath}: ${error}`
        )
      );
      return false;
    }
  }
  const parentDir = dirname(symlinkPath);
  try {
    await mkdir(parentDir, { recursive: true });
    logForDebugging(`Created directory ${parentDir} for symlink`);
  } catch (mkdirError) {
    logError(
      new Error(`Failed to create directory ${parentDir}: ${mkdirError}`)
    );
    return false;
  }
  try {
    let symlinkExists = false;
    try {
      await stat(symlinkPath);
      symlinkExists = true;
    } catch {
    }
    if (symlinkExists) {
      try {
        const currentTarget = await readlink(symlinkPath);
        const resolvedCurrentTarget = resolve(
          dirname(symlinkPath),
          currentTarget
        );
        const resolvedTargetPath = resolve(targetPath);
        if (resolvedCurrentTarget === resolvedTargetPath) {
          return false;
        }
      } catch {
      }
      await unlink(symlinkPath);
    }
  } catch (error) {
    logError(new Error(`Failed to check/remove existing symlink: ${error}`));
  }
  const tempSymlink = `${symlinkPath}.tmp.${process.pid}.${Date.now()}`;
  try {
    await symlink(targetPath, tempSymlink);
    await rename(tempSymlink, symlinkPath);
    logForDebugging(
      `Atomically updated symlink ${symlinkPath} -> ${targetPath}`
    );
    return true;
  } catch (error) {
    try {
      await unlink(tempSymlink);
    } catch {
    }
    logError(
      new Error(
        `Failed to create symlink from ${symlinkPath} to ${targetPath}: ${error}`
      )
    );
    return false;
  }
}
async function checkInstall(force = false) {
  if (isEnvTruthy(process.env.DISABLE_INSTALLATION_CHECKS)) {
    return [];
  }
  const installationType = await getCurrentInstallationType();
  if (installationType === "development") {
    return [];
  }
  const config = getGlobalConfig();
  const shouldCheckNative = force || installationType === "native" || config.installMethod === "native";
  if (!shouldCheckNative) {
    return [];
  }
  const dirs = getBaseDirectories();
  const messages = [];
  const localBinDir = dirname(dirs.executable);
  const resolvedLocalBinPath = resolve(localBinDir);
  const platform = getPlatform();
  const isWindows = platform.startsWith("win32");
  try {
    await access(localBinDir);
  } catch {
    messages.push({
      message: `installMethod is native, but directory ${localBinDir} does not exist`,
      userActionRequired: true,
      type: "error"
    });
  }
  if (isWindows) {
    if (!await isPossibleClaudeBinary(dirs.executable)) {
      messages.push({
        message: `installMethod is native, but claude command is missing or invalid at ${dirs.executable}`,
        userActionRequired: true,
        type: "error"
      });
    }
  } else {
    try {
      const target = await readlink(dirs.executable);
      const absoluteTarget = resolve(dirname(dirs.executable), target);
      if (!await isPossibleClaudeBinary(absoluteTarget)) {
        messages.push({
          message: `Claude symlink points to missing or invalid binary: ${target}`,
          userActionRequired: true,
          type: "error"
        });
      }
    } catch (e) {
      if (isENOENT(e)) {
        messages.push({
          message: `installMethod is native, but claude command not found at ${dirs.executable}`,
          userActionRequired: true,
          type: "error"
        });
      } else {
        if (!await isPossibleClaudeBinary(dirs.executable)) {
          messages.push({
            message: `${dirs.executable} exists but is not a valid Claude binary`,
            userActionRequired: true,
            type: "error"
          });
        }
      }
    }
  }
  const isInCurrentPath = (process.env.PATH || "").split(delimiter).some((entry) => {
    try {
      const resolvedEntry = resolve(entry);
      if (isWindows) {
        return resolvedEntry.toLowerCase() === resolvedLocalBinPath.toLowerCase();
      }
      return resolvedEntry === resolvedLocalBinPath;
    } catch {
      return false;
    }
  });
  if (!isInCurrentPath) {
    if (isWindows) {
      const windowsBinPath = localBinDir.replace(/\//g, "\\");
      messages.push({
        message: `Native installation exists but ${windowsBinPath} is not in your PATH. Add it by opening: System Properties \u2192 Environment Variables \u2192 Edit User PATH \u2192 New \u2192 Add the path above. Then restart your terminal.`,
        userActionRequired: true,
        type: "path"
      });
    } else {
      const shellType = getShellType();
      const configPaths = getShellConfigPaths();
      const configFile = configPaths[shellType];
      const displayPath = configFile ? configFile.replace(homedir(), "~") : "your shell config file";
      messages.push({
        message: `Native installation exists but ~/.local/bin is not in your PATH. Run:

echo 'export PATH="$HOME/.local/bin:$PATH"' >> ${displayPath} && source ${displayPath}`,
        userActionRequired: true,
        type: "path"
      });
    }
  }
  return messages;
}
let inFlightInstall = null;
function installLatest(channelOrVersion, forceReinstall = false) {
  if (forceReinstall) {
    return installLatestImpl(channelOrVersion, forceReinstall);
  }
  if (inFlightInstall) {
    logForDebugging("installLatest: joining in-flight call");
    return inFlightInstall;
  }
  const promise = installLatestImpl(channelOrVersion, forceReinstall);
  inFlightInstall = promise;
  const clear = () => {
    inFlightInstall = null;
  };
  void promise.then(clear, clear);
  return promise;
}
async function installLatestImpl(channelOrVersion, forceReinstall = false) {
  const updateResult = await updateLatest(channelOrVersion, forceReinstall);
  if (!updateResult.success) {
    return {
      latestVersion: null,
      wasUpdated: false,
      lockFailed: updateResult.lockFailed,
      lockHolderPid: updateResult.lockHolderPid
    };
  }
  const config = getGlobalConfig();
  if (config.installMethod !== "native") {
    saveGlobalConfig((current) => ({
      ...current,
      installMethod: "native",
      // Disable legacy auto-updater to prevent npm sessions from deleting native symlinks.
      // Native installations use NativeAutoUpdater instead, which respects native installation.
      autoUpdates: false,
      // Mark this as protection-based, not user preference
      autoUpdatesProtectedForNative: true
    }));
    logForDebugging(
      'Native installer: Set installMethod to "native" and disabled legacy auto-updater for protection'
    );
  }
  void cleanupOldVersions();
  return {
    latestVersion: updateResult.latestVersion,
    wasUpdated: updateResult.success,
    lockFailed: false
  };
}
async function getVersionFromSymlink(symlinkPath) {
  try {
    const target = await readlink(symlinkPath);
    const absoluteTarget = resolve(dirname(symlinkPath), target);
    if (await isPossibleClaudeBinary(absoluteTarget)) {
      return absoluteTarget;
    }
  } catch {
  }
  return null;
}
function getLockFilePathFromVersionPath(dirs, versionPath) {
  const versionName = basename(versionPath);
  return join(dirs.locks, `${versionName}.lock`);
}
async function lockCurrentVersion() {
  const dirs = getBaseDirectories();
  if (!process.execPath.includes(dirs.versions)) {
    return;
  }
  const versionPath = resolve(process.execPath);
  try {
    const lockfilePath = getLockFilePathFromVersionPath(dirs, versionPath);
    await mkdir(dirs.locks, { recursive: true });
    if (isPidBasedLockingEnabled()) {
      const acquired = await acquireProcessLifetimeLock(
        versionPath,
        lockfilePath
      );
      if (!acquired) {
        logEvent("tengu_version_lock_failed", {
          is_pid_based: true,
          is_lifetime_lock: true
        });
        logLockAcquisitionError(
          versionPath,
          new Error("Lock already held by another process")
        );
        return;
      }
      logEvent("tengu_version_lock_acquired", {
        is_pid_based: true,
        is_lifetime_lock: true
      });
      logForDebugging(`Acquired PID lock on running version: ${versionPath}`);
    } else {
      let release;
      try {
        release = await lockfile.lock(versionPath, {
          stale: LOCK_STALE_MS,
          retries: 0,
          // Don't retry - if we can't lock, that's fine
          lockfilePath,
          // Handle lock compromise gracefully (e.g., if another process deletes the lock directory)
          onCompromised: (err) => {
            logForDebugging(
              `NON-FATAL: Lock on running version was compromised: ${err.message}`,
              { level: "info" }
            );
          }
        });
        logEvent("tengu_version_lock_acquired", {
          is_pid_based: false,
          is_lifetime_lock: true
        });
        logForDebugging(
          `Acquired mtime-based lock on running version: ${versionPath}`
        );
        registerCleanup(async () => {
          try {
            await release?.();
          } catch {
          }
        });
      } catch (lockError) {
        if (isENOENT(lockError)) {
          logForDebugging(
            `Cannot lock current version - file does not exist: ${versionPath}`,
            { level: "info" }
          );
          return;
        }
        logEvent("tengu_version_lock_failed", {
          is_pid_based: false,
          is_lifetime_lock: true
        });
        logLockAcquisitionError(versionPath, lockError);
        return;
      }
    }
  } catch (error) {
    if (isENOENT(error)) {
      logForDebugging(
        `Cannot lock current version - file does not exist: ${versionPath}`,
        { level: "info" }
      );
      return;
    }
    logForDebugging(
      `NON-FATAL: Failed to lock current version during execution ${errorMessage(error)}`,
      { level: "info" }
    );
  }
}
function logLockAcquisitionError(versionPath, lockError) {
  logError(
    new Error(
      `NON-FATAL: Lock acquisition failed for ${versionPath} (expected in multi-process scenarios)`,
      { cause: lockError }
    )
  );
}
async function forceRemoveLock(versionFilePath) {
  const dirs = getBaseDirectories();
  const lockfilePath = getLockFilePathFromVersionPath(dirs, versionFilePath);
  try {
    await unlink(lockfilePath);
    logForDebugging(`Force-removed lock file at ${lockfilePath}`);
  } catch (error) {
    logForDebugging(`Failed to force-remove lock file: ${errorMessage(error)}`);
  }
}
async function cleanupOldVersions() {
  await Promise.resolve();
  const dirs = getBaseDirectories();
  const oneHourAgo = Date.now() - 36e5;
  if (getPlatform().startsWith("win32")) {
    const executableDir = dirname(dirs.executable);
    try {
      const files = await readdir(executableDir);
      let cleanedCount = 0;
      for (const file of files) {
        if (!/^claude\.exe\.old\.\d+$/.test(file)) continue;
        try {
          await unlink(join(executableDir, file));
          cleanedCount++;
        } catch {
        }
      }
      if (cleanedCount > 0) {
        logForDebugging(
          `Cleaned up ${cleanedCount} old Windows executables on startup`
        );
      }
    } catch (error) {
      if (!isENOENT(error)) {
        logForDebugging(`Failed to clean up old Windows executables: ${error}`);
      }
    }
  }
  try {
    const stagingEntries = await readdir(dirs.staging);
    let stagingCleanedCount = 0;
    for (const entry of stagingEntries) {
      const stagingPath = join(dirs.staging, entry);
      try {
        const stats = await stat(stagingPath);
        if (stats.mtime.getTime() < oneHourAgo) {
          await rm(stagingPath, { recursive: true, force: true });
          stagingCleanedCount++;
          logForDebugging(`Cleaned up old staging directory: ${entry}`);
        }
      } catch {
      }
    }
    if (stagingCleanedCount > 0) {
      logForDebugging(
        `Cleaned up ${stagingCleanedCount} orphaned staging directories`
      );
      logEvent("tengu_native_staging_cleanup", {
        cleaned_count: stagingCleanedCount
      });
    }
  } catch (error) {
    if (!isENOENT(error)) {
      logForDebugging(`Failed to clean up staging directories: ${error}`);
    }
  }
  if (isPidBasedLockingEnabled()) {
    const staleLocksCleaned = cleanupStaleLocks(dirs.locks);
    if (staleLocksCleaned > 0) {
      logForDebugging(`Cleaned up ${staleLocksCleaned} stale version locks`);
      logEvent("tengu_native_stale_locks_cleanup", {
        cleaned_count: staleLocksCleaned
      });
    }
  }
  let versionEntries;
  try {
    versionEntries = await readdir(dirs.versions);
  } catch (error) {
    if (!isENOENT(error)) {
      logForDebugging(`Failed to readdir versions directory: ${error}`);
    }
    return;
  }
  const versionFiles = [];
  let tempFilesCleanedCount = 0;
  for (const entry of versionEntries) {
    const entryPath = join(dirs.versions, entry);
    if (/\.tmp\.\d+\.\d+$/.test(entry)) {
      try {
        const stats = await stat(entryPath);
        if (stats.mtime.getTime() < oneHourAgo) {
          await unlink(entryPath);
          tempFilesCleanedCount++;
          logForDebugging(`Cleaned up orphaned temp install file: ${entry}`);
        }
      } catch {
      }
      continue;
    }
    try {
      const stats = await stat(entryPath);
      if (!stats.isFile()) continue;
      if (process.platform !== "win32" && stats.size > 0 && (stats.mode & 73) === 0) {
        continue;
      }
      versionFiles.push({
        name: entry,
        path: entryPath,
        resolvedPath: resolve(entryPath),
        mtime: stats.mtime
      });
    } catch {
    }
  }
  if (tempFilesCleanedCount > 0) {
    logForDebugging(
      `Cleaned up ${tempFilesCleanedCount} orphaned temp install files`
    );
    logEvent("tengu_native_temp_files_cleanup", {
      cleaned_count: tempFilesCleanedCount
    });
  }
  if (versionFiles.length === 0) {
    return;
  }
  try {
    const currentBinaryPath = process.execPath;
    const protectedVersions = /* @__PURE__ */ new Set();
    if (currentBinaryPath && currentBinaryPath.includes(dirs.versions)) {
      protectedVersions.add(resolve(currentBinaryPath));
    }
    const currentSymlinkVersion = await getVersionFromSymlink(dirs.executable);
    if (currentSymlinkVersion) {
      protectedVersions.add(currentSymlinkVersion);
    }
    for (const v of versionFiles) {
      if (protectedVersions.has(v.resolvedPath)) continue;
      const lockFilePath = getLockFilePathFromVersionPath(dirs, v.resolvedPath);
      let hasActiveLock = false;
      if (isPidBasedLockingEnabled()) {
        hasActiveLock = isLockActive(lockFilePath);
      } else {
        try {
          hasActiveLock = await lockfile.check(v.resolvedPath, {
            stale: LOCK_STALE_MS,
            lockfilePath: lockFilePath
          });
        } catch {
          hasActiveLock = false;
        }
      }
      if (hasActiveLock) {
        protectedVersions.add(v.resolvedPath);
        logForDebugging(`Protecting locked version from cleanup: ${v.name}`);
      }
    }
    const eligibleVersions = versionFiles.filter((v) => !protectedVersions.has(v.resolvedPath)).sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    const versionsToDelete = eligibleVersions.slice(VERSION_RETENTION_COUNT);
    if (versionsToDelete.length === 0) {
      logEvent("tengu_native_version_cleanup", {
        total_count: versionFiles.length,
        deleted_count: 0,
        protected_count: protectedVersions.size,
        retained_count: VERSION_RETENTION_COUNT,
        lock_failed_count: 0,
        error_count: 0
      });
      return;
    }
    let deletedCount = 0;
    let lockFailedCount = 0;
    let errorCount = 0;
    await Promise.all(
      versionsToDelete.map(async (version) => {
        try {
          const deleted = await tryWithVersionLock(version.path, async () => {
            await unlink(version.path);
          });
          if (deleted) {
            deletedCount++;
          } else {
            lockFailedCount++;
            logForDebugging(
              `Skipping deletion of ${version.name} - locked by another process`
            );
          }
        } catch (error) {
          errorCount++;
          logError(
            new Error(`Failed to delete version ${version.name}: ${error}`)
          );
        }
      })
    );
    logEvent("tengu_native_version_cleanup", {
      total_count: versionFiles.length,
      deleted_count: deletedCount,
      protected_count: protectedVersions.size,
      retained_count: VERSION_RETENTION_COUNT,
      lock_failed_count: lockFailedCount,
      error_count: errorCount
    });
  } catch (error) {
    if (!isENOENT(error)) {
      logError(new Error(`Version cleanup failed: ${error}`));
    }
  }
}
async function isNpmSymlink(executablePath) {
  let targetPath = executablePath;
  const stats = await lstat(executablePath);
  if (stats.isSymbolicLink()) {
    targetPath = await realpath(executablePath);
  }
  return targetPath.endsWith(".js") || targetPath.includes("node_modules");
}
async function removeInstalledSymlink() {
  const dirs = getBaseDirectories();
  try {
    if (await isNpmSymlink(dirs.executable)) {
      logForDebugging(
        `Skipping removal of ${dirs.executable} - appears to be npm-managed`
      );
      return;
    }
    await unlink(dirs.executable);
    logForDebugging(`Removed claude symlink at ${dirs.executable}`);
  } catch (error) {
    if (isENOENT(error)) {
      return;
    }
    logError(new Error(`Failed to remove claude symlink: ${error}`));
  }
}
async function cleanupShellAliases() {
  const messages = [];
  const configMap = getShellConfigPaths();
  for (const [shellType, configFile] of Object.entries(configMap)) {
    try {
      const lines = await readFileLines(configFile);
      if (!lines) continue;
      const { filtered, hadAlias } = filterClaudeAliases(lines);
      if (hadAlias) {
        await writeFileLines(configFile, filtered);
        messages.push({
          message: `Removed claude alias from ${configFile}. Run: unalias claude`,
          userActionRequired: true,
          type: "alias"
        });
        logForDebugging(`Cleaned up claude alias from ${shellType} config`);
      }
    } catch (error) {
      logError(error);
      messages.push({
        message: `Failed to clean up ${configFile}: ${error}`,
        userActionRequired: false,
        type: "error"
      });
    }
  }
  return messages;
}
async function manualRemoveNpmPackage(packageName) {
  try {
    const prefixResult = await execFileNoThrowWithCwd("npm", [
      "config",
      "get",
      "prefix"
    ]);
    if (prefixResult.code !== 0 || !prefixResult.stdout) {
      return {
        success: false,
        error: "Failed to get npm global prefix"
      };
    }
    const globalPrefix = prefixResult.stdout.trim();
    let manuallyRemoved = false;
    async function tryRemove(filePath, description) {
      try {
        await unlink(filePath);
        logForDebugging(`Manually removed ${description}: ${filePath}`);
        return true;
      } catch {
        return false;
      }
    }
    if (getPlatform().startsWith("win32")) {
      const binCmd = join(globalPrefix, "claude.cmd");
      const binPs1 = join(globalPrefix, "claude.ps1");
      const binExe = join(globalPrefix, "claude");
      if (await tryRemove(binCmd, "bin script")) {
        manuallyRemoved = true;
      }
      if (await tryRemove(binPs1, "PowerShell script")) {
        manuallyRemoved = true;
      }
      if (await tryRemove(binExe, "bin executable")) {
        manuallyRemoved = true;
      }
    } else {
      const binSymlink = join(globalPrefix, "bin", "claude");
      if (await tryRemove(binSymlink, "bin symlink")) {
        manuallyRemoved = true;
      }
    }
    if (manuallyRemoved) {
      logForDebugging(`Successfully removed ${packageName} manually`);
      const nodeModulesPath = getPlatform().startsWith("win32") ? join(globalPrefix, "node_modules", packageName) : join(globalPrefix, "lib", "node_modules", packageName);
      return {
        success: true,
        warning: `${packageName} executables removed, but node_modules directory was left intact for safety. You may manually delete it later at: ${nodeModulesPath}`
      };
    } else {
      return { success: false };
    }
  } catch (manualError) {
    logForDebugging(`Manual removal failed: ${manualError}`, {
      level: "error"
    });
    return {
      success: false,
      error: `Manual removal failed: ${manualError}`
    };
  }
}
async function attemptNpmUninstall(packageName) {
  const { code, stderr } = await execFileNoThrowWithCwd(
    "npm",
    ["uninstall", "-g", packageName],
    // eslint-disable-next-line custom-rules/no-process-cwd -- matches original behavior
    { cwd: process.cwd() }
  );
  if (code === 0) {
    logForDebugging(`Removed global npm installation of ${packageName}`);
    return { success: true };
  } else if (stderr && !stderr.includes("npm ERR! code E404")) {
    if (stderr.includes("npm error code ENOTEMPTY")) {
      logForDebugging(
        `Failed to uninstall global npm package ${packageName}: ${stderr}`,
        { level: "error" }
      );
      logForDebugging(`Attempting manual removal due to ENOTEMPTY error`);
      const manualResult = await manualRemoveNpmPackage(packageName);
      if (manualResult.success) {
        return { success: true, warning: manualResult.warning };
      } else if (manualResult.error) {
        return {
          success: false,
          error: `Failed to remove global npm installation of ${packageName}: ${stderr}. Manual removal also failed: ${manualResult.error}`
        };
      }
    }
    logForDebugging(
      `Failed to uninstall global npm package ${packageName}: ${stderr}`,
      { level: "error" }
    );
    return {
      success: false,
      error: `Failed to remove global npm installation of ${packageName}: ${stderr}`
    };
  }
  return { success: false };
}
async function cleanupNpmInstallations() {
  const errors = [];
  const warnings = [];
  let removed = 0;
  const codePackageResult = await attemptNpmUninstall(
    "@anthropic-ai/claude-code"
  );
  if (codePackageResult.success) {
    removed++;
    if (codePackageResult.warning) {
      warnings.push(codePackageResult.warning);
    }
  } else if (codePackageResult.error) {
    errors.push(codePackageResult.error);
  }
  if (true) {
    const macroPackageResult = await attemptNpmUninstall("claude-code-reconstructed");
    if (macroPackageResult.success) {
      removed++;
      if (macroPackageResult.warning) {
        warnings.push(macroPackageResult.warning);
      }
    } else if (macroPackageResult.error) {
      errors.push(macroPackageResult.error);
    }
  }
  const localInstallDir = join(homedir(), ".claude", "local");
  try {
    await rm(localInstallDir, { recursive: true });
    removed++;
    logForDebugging(`Removed local installation at ${localInstallDir}`);
  } catch (error) {
    if (!isENOENT(error)) {
      errors.push(`Failed to remove ${localInstallDir}: ${error}`);
      logForDebugging(`Failed to remove local installation: ${error}`, {
        level: "error"
      });
    }
  }
  return { removed, errors, warnings };
}
export {
  VERSION_RETENTION_COUNT,
  checkInstall,
  cleanupNpmInstallations,
  cleanupOldVersions,
  cleanupShellAliases,
  getBinaryName,
  getPlatform,
  installLatest,
  lockCurrentVersion,
  removeDirectoryIfEmpty,
  removeInstalledSymlink
};
