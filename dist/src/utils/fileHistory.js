import { createHash } from "crypto";
import { diffLines } from "diff";
import {
  chmod,
  copyFile,
  link,
  mkdir,
  readFile,
  stat,
  unlink
} from "fs/promises";
import { dirname, isAbsolute, join, relative } from "path";
import {
  getIsNonInteractiveSession,
  getOriginalCwd,
  getSessionId
} from "../bootstrap/state.js";
import { logEvent } from "../services/analytics/index.js";
import { notifyVscodeFileUpdated } from "../services/mcp/vscodeSdkMcp.js";
import { inspect } from "util";
import { getGlobalConfig } from "./config.js";
import { logForDebugging } from "./debug.js";
import { getClaudeConfigHomeDir, isEnvTruthy } from "./envUtils.js";
import { getErrnoCode, isENOENT } from "./errors.js";
import { pathExists } from "./file.js";
import { logError } from "./log.js";
import { recordFileHistorySnapshot } from "./sessionStorage.js";
const MAX_SNAPSHOTS = 100;
function fileHistoryEnabled() {
  if (getIsNonInteractiveSession()) {
    return fileHistoryEnabledSdk();
  }
  return getGlobalConfig().fileCheckpointingEnabled !== false && !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING);
}
function fileHistoryEnabledSdk() {
  return isEnvTruthy(process.env.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING) && !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING);
}
async function fileHistoryTrackEdit(updateFileHistoryState, filePath, messageId) {
  if (!fileHistoryEnabled()) {
    return;
  }
  const trackingPath = maybeShortenFilePath(filePath);
  let captured;
  updateFileHistoryState((state) => {
    captured = state;
    return state;
  });
  if (!captured) return;
  const mostRecent = captured.snapshots.at(-1);
  if (!mostRecent) {
    logError(new Error("FileHistory: Missing most recent snapshot"));
    logEvent("tengu_file_history_track_edit_failed", {});
    return;
  }
  if (mostRecent.trackedFileBackups[trackingPath]) {
    return;
  }
  let backup;
  try {
    backup = await createBackup(filePath, 1);
  } catch (error) {
    logError(error);
    logEvent("tengu_file_history_track_edit_failed", {});
    return;
  }
  const isAddingFile = backup.backupFileName === null;
  updateFileHistoryState((state) => {
    try {
      const mostRecentSnapshot = state.snapshots.at(-1);
      if (!mostRecentSnapshot || mostRecentSnapshot.trackedFileBackups[trackingPath]) {
        return state;
      }
      const updatedTrackedFiles = state.trackedFiles.has(trackingPath) ? state.trackedFiles : new Set(state.trackedFiles).add(trackingPath);
      const updatedMostRecentSnapshot = {
        ...mostRecentSnapshot,
        trackedFileBackups: {
          ...mostRecentSnapshot.trackedFileBackups,
          [trackingPath]: backup
        }
      };
      const updatedState = {
        ...state,
        snapshots: (() => {
          const copy = state.snapshots.slice();
          copy[copy.length - 1] = updatedMostRecentSnapshot;
          return copy;
        })(),
        trackedFiles: updatedTrackedFiles
      };
      maybeDumpStateForDebug(updatedState);
      void recordFileHistorySnapshot(
        messageId,
        updatedMostRecentSnapshot,
        true
        // isSnapshotUpdate
      ).catch((error) => {
        logError(new Error(`FileHistory: Failed to record snapshot: ${error}`));
      });
      logEvent("tengu_file_history_track_edit_success", {
        isNewFile: isAddingFile,
        version: backup.version
      });
      logForDebugging(`FileHistory: Tracked file modification for ${filePath}`);
      return updatedState;
    } catch (error) {
      logError(error);
      logEvent("tengu_file_history_track_edit_failed", {});
      return state;
    }
  });
}
async function fileHistoryMakeSnapshot(updateFileHistoryState, messageId) {
  if (!fileHistoryEnabled()) {
    return void 0;
  }
  let captured;
  updateFileHistoryState((state) => {
    captured = state;
    return state;
  });
  if (!captured) return;
  const trackedFileBackups = {};
  const mostRecentSnapshot = captured.snapshots.at(-1);
  if (mostRecentSnapshot) {
    logForDebugging(`FileHistory: Making snapshot for message ${messageId}`);
    await Promise.all(
      Array.from(captured.trackedFiles, async (trackingPath) => {
        try {
          const filePath = maybeExpandFilePath(trackingPath);
          const latestBackup = mostRecentSnapshot.trackedFileBackups[trackingPath];
          const nextVersion = latestBackup ? latestBackup.version + 1 : 1;
          let fileStats;
          try {
            fileStats = await stat(filePath);
          } catch (e) {
            if (!isENOENT(e)) throw e;
          }
          if (!fileStats) {
            trackedFileBackups[trackingPath] = {
              backupFileName: null,
              // Use null to denote missing tracked file
              version: nextVersion,
              backupTime: /* @__PURE__ */ new Date()
            };
            logEvent("tengu_file_history_backup_deleted_file", {
              version: nextVersion
            });
            logForDebugging(
              `FileHistory: Missing tracked file: ${trackingPath}`
            );
            return;
          }
          if (latestBackup && latestBackup.backupFileName !== null && !await checkOriginFileChanged(
            filePath,
            latestBackup.backupFileName,
            fileStats
          )) {
            trackedFileBackups[trackingPath] = latestBackup;
            return;
          }
          trackedFileBackups[trackingPath] = await createBackup(
            filePath,
            nextVersion
          );
        } catch (error) {
          logError(error);
          logEvent("tengu_file_history_backup_file_failed", {});
        }
      })
    );
  }
  updateFileHistoryState((state) => {
    try {
      const lastSnapshot = state.snapshots.at(-1);
      if (lastSnapshot) {
        for (const trackingPath of state.trackedFiles) {
          if (trackingPath in trackedFileBackups) continue;
          const inherited = lastSnapshot.trackedFileBackups[trackingPath];
          if (inherited) trackedFileBackups[trackingPath] = inherited;
        }
      }
      const now = /* @__PURE__ */ new Date();
      const newSnapshot = {
        messageId,
        trackedFileBackups,
        timestamp: now
      };
      const allSnapshots = [...state.snapshots, newSnapshot];
      const updatedState = {
        ...state,
        snapshots: allSnapshots.length > MAX_SNAPSHOTS ? allSnapshots.slice(-MAX_SNAPSHOTS) : allSnapshots,
        snapshotSequence: (state.snapshotSequence ?? 0) + 1
      };
      maybeDumpStateForDebug(updatedState);
      void notifyVscodeSnapshotFilesUpdated(state, updatedState).catch(logError);
      void recordFileHistorySnapshot(
        messageId,
        newSnapshot,
        false
        // isSnapshotUpdate
      ).catch((error) => {
        logError(new Error(`FileHistory: Failed to record snapshot: ${error}`));
      });
      logForDebugging(
        `FileHistory: Added snapshot for ${messageId}, tracking ${state.trackedFiles.size} files`
      );
      logEvent("tengu_file_history_snapshot_success", {
        trackedFilesCount: state.trackedFiles.size,
        snapshotCount: updatedState.snapshots.length
      });
      return updatedState;
    } catch (error) {
      logError(error);
      logEvent("tengu_file_history_snapshot_failed", {});
      return state;
    }
  });
}
async function fileHistoryRewind(updateFileHistoryState, messageId) {
  if (!fileHistoryEnabled()) {
    return;
  }
  let captured;
  updateFileHistoryState((state) => {
    captured = state;
    return state;
  });
  if (!captured) return;
  const targetSnapshot = captured.snapshots.findLast(
    (snapshot) => snapshot.messageId === messageId
  );
  if (!targetSnapshot) {
    logError(new Error(`FileHistory: Snapshot for ${messageId} not found`));
    logEvent("tengu_file_history_rewind_failed", {
      trackedFilesCount: captured.trackedFiles.size,
      snapshotFound: false
    });
    throw new Error("The selected snapshot was not found");
  }
  try {
    logForDebugging(
      `FileHistory: [Rewind] Rewinding to snapshot for ${messageId}`
    );
    const filesChanged = await applySnapshot(captured, targetSnapshot);
    logForDebugging(`FileHistory: [Rewind] Finished rewinding to ${messageId}`);
    logEvent("tengu_file_history_rewind_success", {
      trackedFilesCount: captured.trackedFiles.size,
      filesChangedCount: filesChanged.length
    });
  } catch (error) {
    logError(error);
    logEvent("tengu_file_history_rewind_failed", {
      trackedFilesCount: captured.trackedFiles.size,
      snapshotFound: true
    });
    throw error;
  }
}
function fileHistoryCanRestore(state, messageId) {
  if (!fileHistoryEnabled()) {
    return false;
  }
  return state.snapshots.some((snapshot) => snapshot.messageId === messageId);
}
async function fileHistoryGetDiffStats(state, messageId) {
  if (!fileHistoryEnabled()) {
    return void 0;
  }
  const targetSnapshot = state.snapshots.findLast(
    (snapshot) => snapshot.messageId === messageId
  );
  if (!targetSnapshot) {
    return void 0;
  }
  const results = await Promise.all(
    Array.from(state.trackedFiles, async (trackingPath) => {
      try {
        const filePath = maybeExpandFilePath(trackingPath);
        const targetBackup = targetSnapshot.trackedFileBackups[trackingPath];
        const backupFileName = targetBackup ? targetBackup.backupFileName : getBackupFileNameFirstVersion(trackingPath, state);
        if (backupFileName === void 0) {
          logError(
            new Error("FileHistory: Error finding the backup file to apply")
          );
          logEvent("tengu_file_history_rewind_restore_file_failed", {
            dryRun: true
          });
          return null;
        }
        const stats = await computeDiffStatsForFile(
          filePath,
          backupFileName === null ? void 0 : backupFileName
        );
        if (stats?.insertions || stats?.deletions) {
          return { filePath, stats };
        }
        if (backupFileName === null && await pathExists(filePath)) {
          return { filePath, stats };
        }
        return null;
      } catch (error) {
        logError(error);
        logEvent("tengu_file_history_rewind_restore_file_failed", {
          dryRun: true
        });
        return null;
      }
    })
  );
  const filesChanged = [];
  let insertions = 0;
  let deletions = 0;
  for (const r of results) {
    if (!r) continue;
    filesChanged.push(r.filePath);
    insertions += r.stats?.insertions || 0;
    deletions += r.stats?.deletions || 0;
  }
  return { filesChanged, insertions, deletions };
}
async function fileHistoryHasAnyChanges(state, messageId) {
  if (!fileHistoryEnabled()) {
    return false;
  }
  const targetSnapshot = state.snapshots.findLast(
    (snapshot) => snapshot.messageId === messageId
  );
  if (!targetSnapshot) {
    return false;
  }
  for (const trackingPath of state.trackedFiles) {
    try {
      const filePath = maybeExpandFilePath(trackingPath);
      const targetBackup = targetSnapshot.trackedFileBackups[trackingPath];
      const backupFileName = targetBackup ? targetBackup.backupFileName : getBackupFileNameFirstVersion(trackingPath, state);
      if (backupFileName === void 0) {
        continue;
      }
      if (backupFileName === null) {
        if (await pathExists(filePath)) return true;
        continue;
      }
      if (await checkOriginFileChanged(filePath, backupFileName)) return true;
    } catch (error) {
      logError(error);
    }
  }
  return false;
}
async function applySnapshot(state, targetSnapshot) {
  const filesChanged = [];
  for (const trackingPath of state.trackedFiles) {
    try {
      const filePath = maybeExpandFilePath(trackingPath);
      const targetBackup = targetSnapshot.trackedFileBackups[trackingPath];
      const backupFileName = targetBackup ? targetBackup.backupFileName : getBackupFileNameFirstVersion(trackingPath, state);
      if (backupFileName === void 0) {
        logError(
          new Error("FileHistory: Error finding the backup file to apply")
        );
        logEvent("tengu_file_history_rewind_restore_file_failed", {
          dryRun: false
        });
        continue;
      }
      if (backupFileName === null) {
        try {
          await unlink(filePath);
          logForDebugging(`FileHistory: [Rewind] Deleted ${filePath}`);
          filesChanged.push(filePath);
        } catch (e) {
          if (!isENOENT(e)) throw e;
        }
        continue;
      }
      if (await checkOriginFileChanged(filePath, backupFileName)) {
        await restoreBackup(filePath, backupFileName);
        logForDebugging(
          `FileHistory: [Rewind] Restored ${filePath} from ${backupFileName}`
        );
        filesChanged.push(filePath);
      }
    } catch (error) {
      logError(error);
      logEvent("tengu_file_history_rewind_restore_file_failed", {
        dryRun: false
      });
    }
  }
  return filesChanged;
}
async function checkOriginFileChanged(originalFile, backupFileName, originalStatsHint) {
  const backupPath = resolveBackupPath(backupFileName);
  let originalStats = originalStatsHint ?? null;
  if (!originalStats) {
    try {
      originalStats = await stat(originalFile);
    } catch (e) {
      if (!isENOENT(e)) return true;
    }
  }
  let backupStats = null;
  try {
    backupStats = await stat(backupPath);
  } catch (e) {
    if (!isENOENT(e)) return true;
  }
  return compareStatsAndContent(originalStats, backupStats, async () => {
    try {
      const [originalContent, backupContent] = await Promise.all([
        readFile(originalFile, "utf-8"),
        readFile(backupPath, "utf-8")
      ]);
      return originalContent !== backupContent;
    } catch {
      return true;
    }
  });
}
function compareStatsAndContent(originalStats, backupStats, compareContent) {
  if (originalStats === null !== (backupStats === null)) {
    return true;
  }
  if (originalStats === null || backupStats === null) {
    return false;
  }
  if (originalStats.mode !== backupStats.mode || originalStats.size !== backupStats.size) {
    return true;
  }
  if (originalStats.mtimeMs < backupStats.mtimeMs) {
    return false;
  }
  return compareContent();
}
async function computeDiffStatsForFile(originalFile, backupFileName) {
  const filesChanged = [];
  let insertions = 0;
  let deletions = 0;
  try {
    const backupPath = backupFileName ? resolveBackupPath(backupFileName) : void 0;
    const [originalContent, backupContent] = await Promise.all([
      readFileAsyncOrNull(originalFile),
      backupPath ? readFileAsyncOrNull(backupPath) : null
    ]);
    if (originalContent === null && backupContent === null) {
      return {
        filesChanged,
        insertions,
        deletions
      };
    }
    filesChanged.push(originalFile);
    const changes = diffLines(originalContent ?? "", backupContent ?? "");
    changes.forEach((c) => {
      if (c.added) {
        insertions += c.count || 0;
      }
      if (c.removed) {
        deletions += c.count || 0;
      }
    });
  } catch (error) {
    logError(new Error(`FileHistory: Error generating diffStats: ${error}`));
  }
  return {
    filesChanged,
    insertions,
    deletions
  };
}
function getBackupFileName(filePath, version) {
  const fileNameHash = createHash("sha256").update(filePath).digest("hex").slice(0, 16);
  return `${fileNameHash}@v${version}`;
}
function resolveBackupPath(backupFileName, sessionId) {
  const configDir = getClaudeConfigHomeDir();
  return join(
    configDir,
    "file-history",
    sessionId || getSessionId(),
    backupFileName
  );
}
async function createBackup(filePath, version) {
  if (filePath === null) {
    return { backupFileName: null, version, backupTime: /* @__PURE__ */ new Date() };
  }
  const backupFileName = getBackupFileName(filePath, version);
  const backupPath = resolveBackupPath(backupFileName);
  let srcStats;
  try {
    srcStats = await stat(filePath);
  } catch (e) {
    if (isENOENT(e)) {
      return { backupFileName: null, version, backupTime: /* @__PURE__ */ new Date() };
    }
    throw e;
  }
  try {
    await copyFile(filePath, backupPath);
  } catch (e) {
    if (!isENOENT(e)) throw e;
    await mkdir(dirname(backupPath), { recursive: true });
    await copyFile(filePath, backupPath);
  }
  await chmod(backupPath, srcStats.mode);
  logEvent("tengu_file_history_backup_file_created", {
    version,
    fileSize: srcStats.size
  });
  return {
    backupFileName,
    version,
    backupTime: /* @__PURE__ */ new Date()
  };
}
async function restoreBackup(filePath, backupFileName) {
  const backupPath = resolveBackupPath(backupFileName);
  let backupStats;
  try {
    backupStats = await stat(backupPath);
  } catch (e) {
    if (isENOENT(e)) {
      logEvent("tengu_file_history_rewind_restore_file_failed", {});
      logError(
        new Error(`FileHistory: [Rewind] Backup file not found: ${backupPath}`)
      );
      return;
    }
    throw e;
  }
  try {
    await copyFile(backupPath, filePath);
  } catch (e) {
    if (!isENOENT(e)) throw e;
    await mkdir(dirname(filePath), { recursive: true });
    await copyFile(backupPath, filePath);
  }
  await chmod(filePath, backupStats.mode);
}
function getBackupFileNameFirstVersion(trackingPath, state) {
  for (const snapshot of state.snapshots) {
    const backup = snapshot.trackedFileBackups[trackingPath];
    if (backup !== void 0 && backup.version === 1) {
      return backup.backupFileName;
    }
  }
  return void 0;
}
function maybeShortenFilePath(filePath) {
  if (!isAbsolute(filePath)) {
    return filePath;
  }
  const cwd = getOriginalCwd();
  if (filePath.startsWith(cwd)) {
    return relative(cwd, filePath);
  }
  return filePath;
}
function maybeExpandFilePath(filePath) {
  if (isAbsolute(filePath)) {
    return filePath;
  }
  return join(getOriginalCwd(), filePath);
}
function fileHistoryRestoreStateFromLog(fileHistorySnapshots, onUpdateState) {
  if (!fileHistoryEnabled()) {
    return;
  }
  const snapshots = [];
  const trackedFiles = /* @__PURE__ */ new Set();
  for (const snapshot of fileHistorySnapshots) {
    const trackedFileBackups = {};
    for (const [path, backup] of Object.entries(snapshot.trackedFileBackups)) {
      const trackingPath = maybeShortenFilePath(path);
      trackedFiles.add(trackingPath);
      trackedFileBackups[trackingPath] = backup;
    }
    snapshots.push({
      ...snapshot,
      trackedFileBackups
    });
  }
  onUpdateState({
    snapshots,
    trackedFiles,
    snapshotSequence: snapshots.length
  });
}
async function copyFileHistoryForResume(log) {
  if (!fileHistoryEnabled()) {
    return;
  }
  const fileHistorySnapshots = log.fileHistorySnapshots;
  if (!fileHistorySnapshots || log.messages.length === 0) {
    return;
  }
  const lastMessage = log.messages[log.messages.length - 1];
  const previousSessionId = lastMessage?.sessionId;
  if (!previousSessionId) {
    logError(
      new Error(
        `FileHistory: Failed to copy backups on restore (no previous session id)`
      )
    );
    return;
  }
  const sessionId = getSessionId();
  if (previousSessionId === sessionId) {
    logForDebugging(
      `FileHistory: No need to copy file history for resuming with same session id: ${sessionId}`
    );
    return;
  }
  try {
    const newBackupDir = join(
      getClaudeConfigHomeDir(),
      "file-history",
      sessionId
    );
    await mkdir(newBackupDir, { recursive: true });
    let failedSnapshots = 0;
    await Promise.allSettled(
      fileHistorySnapshots.map(async (snapshot) => {
        const backupEntries = Object.values(snapshot.trackedFileBackups).filter(
          (backup) => backup.backupFileName !== null
        );
        const results = await Promise.allSettled(
          backupEntries.map(async ({ backupFileName }) => {
            const oldBackupPath = resolveBackupPath(
              backupFileName,
              previousSessionId
            );
            const newBackupPath = join(newBackupDir, backupFileName);
            try {
              await link(oldBackupPath, newBackupPath);
            } catch (e) {
              const code = getErrnoCode(e);
              if (code === "EEXIST") {
                return;
              }
              if (code === "ENOENT") {
                logError(
                  new Error(
                    `FileHistory: Failed to copy backup ${backupFileName} on restore (backup file does not exist in ${previousSessionId})`
                  )
                );
                throw e;
              }
              logError(
                new Error(
                  `FileHistory: Error hard linking backup file from previous session`
                )
              );
              try {
                await copyFile(oldBackupPath, newBackupPath);
              } catch (copyErr) {
                logError(
                  new Error(
                    `FileHistory: Error copying over backup from previous session`
                  )
                );
                throw copyErr;
              }
            }
            logForDebugging(
              `FileHistory: Copied backup ${backupFileName} from session ${previousSessionId} to ${sessionId}`
            );
          })
        );
        const copyFailed = results.some((r) => r.status === "rejected");
        if (!copyFailed) {
          void recordFileHistorySnapshot(
            snapshot.messageId,
            snapshot,
            false
            // isSnapshotUpdate
          ).catch((_) => {
            logError(
              new Error(`FileHistory: Failed to record copy backup snapshot`)
            );
          });
        } else {
          failedSnapshots++;
        }
      })
    );
    if (failedSnapshots > 0) {
      logEvent("tengu_file_history_resume_copy_failed", {
        numSnapshots: fileHistorySnapshots.length,
        failedSnapshots
      });
    }
  } catch (error) {
    logError(error);
  }
}
async function notifyVscodeSnapshotFilesUpdated(oldState, newState) {
  const oldSnapshot = oldState.snapshots.at(-1);
  const newSnapshot = newState.snapshots.at(-1);
  if (!newSnapshot) {
    return;
  }
  for (const trackingPath of newState.trackedFiles) {
    const filePath = maybeExpandFilePath(trackingPath);
    const oldBackup = oldSnapshot?.trackedFileBackups[trackingPath];
    const newBackup = newSnapshot.trackedFileBackups[trackingPath];
    if (oldBackup?.backupFileName === newBackup?.backupFileName && oldBackup?.version === newBackup?.version) {
      continue;
    }
    let oldContent = null;
    if (oldBackup?.backupFileName) {
      const backupPath = resolveBackupPath(oldBackup.backupFileName);
      oldContent = await readFileAsyncOrNull(backupPath);
    }
    let newContent = null;
    if (newBackup?.backupFileName) {
      const backupPath = resolveBackupPath(newBackup.backupFileName);
      newContent = await readFileAsyncOrNull(backupPath);
    }
    if (oldContent !== newContent) {
      notifyVscodeFileUpdated(filePath, oldContent, newContent);
    }
  }
}
async function readFileAsyncOrNull(path) {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}
const ENABLE_DUMP_STATE = false;
function maybeDumpStateForDebug(state) {
  if (ENABLE_DUMP_STATE) {
    console.error(inspect(state, false, 5));
  }
}
export {
  checkOriginFileChanged,
  copyFileHistoryForResume,
  fileHistoryCanRestore,
  fileHistoryEnabled,
  fileHistoryGetDiffStats,
  fileHistoryHasAnyChanges,
  fileHistoryMakeSnapshot,
  fileHistoryRestoreStateFromLog,
  fileHistoryRewind,
  fileHistoryTrackEdit
};
