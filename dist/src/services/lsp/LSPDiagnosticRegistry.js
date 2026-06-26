import { randomUUID } from "crypto";
import { LRUCache } from "lru-cache";
import { logForDebugging } from "../../utils/debug.js";
import { toError } from "../../utils/errors.js";
import { logError } from "../../utils/log.js";
import { jsonStringify } from "../../utils/slowOperations.js";
const MAX_DIAGNOSTICS_PER_FILE = 10;
const MAX_TOTAL_DIAGNOSTICS = 30;
const MAX_DELIVERED_FILES = 500;
const pendingDiagnostics = /* @__PURE__ */ new Map();
const deliveredDiagnostics = new LRUCache({
  max: MAX_DELIVERED_FILES
});
function registerPendingLSPDiagnostic({
  serverName,
  files
}) {
  const diagnosticId = randomUUID();
  logForDebugging(
    `LSP Diagnostics: Registering ${files.length} diagnostic file(s) from ${serverName} (ID: ${diagnosticId})`
  );
  pendingDiagnostics.set(diagnosticId, {
    serverName,
    files,
    timestamp: Date.now(),
    attachmentSent: false
  });
}
function severityToNumber(severity) {
  switch (severity) {
    case "Error":
      return 1;
    case "Warning":
      return 2;
    case "Info":
      return 3;
    case "Hint":
      return 4;
    default:
      return 4;
  }
}
function createDiagnosticKey(diag) {
  return jsonStringify({
    message: diag.message,
    severity: diag.severity,
    range: diag.range,
    source: diag.source || null,
    code: diag.code || null
  });
}
function deduplicateDiagnosticFiles(allFiles) {
  const fileMap = /* @__PURE__ */ new Map();
  const dedupedFiles = [];
  for (const file of allFiles) {
    if (!fileMap.has(file.uri)) {
      fileMap.set(file.uri, /* @__PURE__ */ new Set());
      dedupedFiles.push({ uri: file.uri, diagnostics: [] });
    }
    const seenDiagnostics = fileMap.get(file.uri);
    const dedupedFile = dedupedFiles.find((f) => f.uri === file.uri);
    const previouslyDelivered = deliveredDiagnostics.get(file.uri) || /* @__PURE__ */ new Set();
    for (const diag of file.diagnostics) {
      try {
        const key = createDiagnosticKey(diag);
        if (seenDiagnostics.has(key) || previouslyDelivered.has(key)) {
          continue;
        }
        seenDiagnostics.add(key);
        dedupedFile.diagnostics.push(diag);
      } catch (error) {
        const err = toError(error);
        const truncatedMessage = diag.message?.substring(0, 100) || "<no message>";
        logError(
          new Error(
            `Failed to deduplicate diagnostic in ${file.uri}: ${err.message}. Diagnostic message: ${truncatedMessage}`
          )
        );
        dedupedFile.diagnostics.push(diag);
      }
    }
  }
  return dedupedFiles.filter((f) => f.diagnostics.length > 0);
}
function checkForLSPDiagnostics() {
  logForDebugging(
    `LSP Diagnostics: Checking registry - ${pendingDiagnostics.size} pending`
  );
  const allFiles = [];
  const serverNames = /* @__PURE__ */ new Set();
  const diagnosticsToMark = [];
  for (const diagnostic of pendingDiagnostics.values()) {
    if (!diagnostic.attachmentSent) {
      allFiles.push(...diagnostic.files);
      serverNames.add(diagnostic.serverName);
      diagnosticsToMark.push(diagnostic);
    }
  }
  if (allFiles.length === 0) {
    return [];
  }
  let dedupedFiles;
  try {
    dedupedFiles = deduplicateDiagnosticFiles(allFiles);
  } catch (error) {
    const err = toError(error);
    logError(new Error(`Failed to deduplicate LSP diagnostics: ${err.message}`));
    dedupedFiles = allFiles;
  }
  for (const diagnostic of diagnosticsToMark) {
    diagnostic.attachmentSent = true;
  }
  for (const [id, diagnostic] of pendingDiagnostics) {
    if (diagnostic.attachmentSent) {
      pendingDiagnostics.delete(id);
    }
  }
  const originalCount = allFiles.reduce(
    (sum, f) => sum + f.diagnostics.length,
    0
  );
  const dedupedCount = dedupedFiles.reduce(
    (sum, f) => sum + f.diagnostics.length,
    0
  );
  if (originalCount > dedupedCount) {
    logForDebugging(
      `LSP Diagnostics: Deduplication removed ${originalCount - dedupedCount} duplicate diagnostic(s)`
    );
  }
  let totalDiagnostics = 0;
  let truncatedCount = 0;
  for (const file of dedupedFiles) {
    file.diagnostics.sort(
      (a, b) => severityToNumber(a.severity) - severityToNumber(b.severity)
    );
    if (file.diagnostics.length > MAX_DIAGNOSTICS_PER_FILE) {
      truncatedCount += file.diagnostics.length - MAX_DIAGNOSTICS_PER_FILE;
      file.diagnostics = file.diagnostics.slice(0, MAX_DIAGNOSTICS_PER_FILE);
    }
    const remainingCapacity = MAX_TOTAL_DIAGNOSTICS - totalDiagnostics;
    if (file.diagnostics.length > remainingCapacity) {
      truncatedCount += file.diagnostics.length - remainingCapacity;
      file.diagnostics = file.diagnostics.slice(0, remainingCapacity);
    }
    totalDiagnostics += file.diagnostics.length;
  }
  dedupedFiles = dedupedFiles.filter((f) => f.diagnostics.length > 0);
  if (truncatedCount > 0) {
    logForDebugging(
      `LSP Diagnostics: Volume limiting removed ${truncatedCount} diagnostic(s) (max ${MAX_DIAGNOSTICS_PER_FILE}/file, ${MAX_TOTAL_DIAGNOSTICS} total)`
    );
  }
  for (const file of dedupedFiles) {
    if (!deliveredDiagnostics.has(file.uri)) {
      deliveredDiagnostics.set(file.uri, /* @__PURE__ */ new Set());
    }
    const delivered = deliveredDiagnostics.get(file.uri);
    for (const diag of file.diagnostics) {
      try {
        delivered.add(createDiagnosticKey(diag));
      } catch (error) {
        const err = toError(error);
        const truncatedMessage = diag.message?.substring(0, 100) || "<no message>";
        logError(
          new Error(
            `Failed to track delivered diagnostic in ${file.uri}: ${err.message}. Diagnostic message: ${truncatedMessage}`
          )
        );
      }
    }
  }
  const finalCount = dedupedFiles.reduce(
    (sum, f) => sum + f.diagnostics.length,
    0
  );
  if (finalCount === 0) {
    logForDebugging(
      `LSP Diagnostics: No new diagnostics to deliver (all filtered by deduplication)`
    );
    return [];
  }
  logForDebugging(
    `LSP Diagnostics: Delivering ${dedupedFiles.length} file(s) with ${finalCount} diagnostic(s) from ${serverNames.size} server(s)`
  );
  return [
    {
      serverName: Array.from(serverNames).join(", "),
      files: dedupedFiles
    }
  ];
}
function clearAllLSPDiagnostics() {
  logForDebugging(
    `LSP Diagnostics: Clearing ${pendingDiagnostics.size} pending diagnostic(s)`
  );
  pendingDiagnostics.clear();
}
function resetAllLSPDiagnosticState() {
  logForDebugging(
    `LSP Diagnostics: Resetting all state (${pendingDiagnostics.size} pending, ${deliveredDiagnostics.size} files tracked)`
  );
  pendingDiagnostics.clear();
  deliveredDiagnostics.clear();
}
function clearDeliveredDiagnosticsForFile(fileUri) {
  if (deliveredDiagnostics.has(fileUri)) {
    logForDebugging(
      `LSP Diagnostics: Clearing delivered diagnostics for ${fileUri}`
    );
    deliveredDiagnostics.delete(fileUri);
  }
}
function getPendingLSPDiagnosticCount() {
  return pendingDiagnostics.size;
}
export {
  checkForLSPDiagnostics,
  clearAllLSPDiagnostics,
  clearDeliveredDiagnosticsForFile,
  getPendingLSPDiagnosticCount,
  registerPendingLSPDiagnostic,
  resetAllLSPDiagnosticState
};
