import figures from "figures";
import { logError } from "../utils/log.js";
import { callIdeRpc } from "../services/mcp/client.js";
import { ClaudeError } from "../utils/errors.js";
import { normalizePathForComparison, pathsEqual } from "../utils/file.js";
import { getConnectedIdeClient } from "../utils/ide.js";
import { jsonParse } from "../utils/slowOperations.js";
class DiagnosticsTrackingError extends ClaudeError {
}
const MAX_DIAGNOSTICS_SUMMARY_CHARS = 4e3;
class DiagnosticTrackingService {
  static instance;
  baseline = /* @__PURE__ */ new Map();
  initialized = false;
  mcpClient;
  // Track when files were last processed/fetched
  lastProcessedTimestamps = /* @__PURE__ */ new Map();
  // Track which files have received right file diagnostics and if they've changed
  // Map<normalizedPath, lastClaudeFsRightDiagnostics>
  rightFileDiagnosticsState = /* @__PURE__ */ new Map();
  static getInstance() {
    if (!DiagnosticTrackingService.instance) {
      DiagnosticTrackingService.instance = new DiagnosticTrackingService();
    }
    return DiagnosticTrackingService.instance;
  }
  initialize(mcpClient) {
    if (this.initialized) {
      return;
    }
    this.mcpClient = mcpClient;
    this.initialized = true;
  }
  async shutdown() {
    this.initialized = false;
    this.baseline.clear();
    this.rightFileDiagnosticsState.clear();
    this.lastProcessedTimestamps.clear();
  }
  /**
   * Reset tracking state while keeping the service initialized.
   * This clears all tracked files and diagnostics.
   */
  reset() {
    this.baseline.clear();
    this.rightFileDiagnosticsState.clear();
    this.lastProcessedTimestamps.clear();
  }
  normalizeFileUri(fileUri) {
    const protocolPrefixes = [
      "file://",
      "_claude_fs_right:",
      "_claude_fs_left:"
    ];
    let normalized = fileUri;
    for (const prefix of protocolPrefixes) {
      if (fileUri.startsWith(prefix)) {
        normalized = fileUri.slice(prefix.length);
        break;
      }
    }
    return normalizePathForComparison(normalized);
  }
  /**
   * Ensure a file is opened in the IDE before processing.
   * This is important for language services like diagnostics to work properly.
   */
  async ensureFileOpened(fileUri) {
    if (!this.initialized || !this.mcpClient || this.mcpClient.type !== "connected") {
      return;
    }
    try {
      await callIdeRpc(
        "openFile",
        {
          filePath: fileUri,
          preview: false,
          startText: "",
          endText: "",
          selectToEndOfLine: false,
          makeFrontmost: false
        },
        this.mcpClient
      );
    } catch (error) {
      logError(error);
    }
  }
  /**
   * Capture baseline diagnostics for a specific file before editing.
   * This is called before editing a file to ensure we have a baseline to compare against.
   */
  async beforeFileEdited(filePath) {
    if (!this.initialized || !this.mcpClient || this.mcpClient.type !== "connected") {
      return;
    }
    const timestamp = Date.now();
    try {
      const result = await callIdeRpc(
        "getDiagnostics",
        { uri: `file://${filePath}` },
        this.mcpClient
      );
      const diagnosticFile = this.parseDiagnosticResult(result)[0];
      if (diagnosticFile) {
        if (!pathsEqual(
          this.normalizeFileUri(filePath),
          this.normalizeFileUri(diagnosticFile.uri)
        )) {
          logError(
            new DiagnosticsTrackingError(
              `Diagnostics file path mismatch: expected ${filePath}, got ${diagnosticFile.uri})`
            )
          );
          return;
        }
        const normalizedPath = this.normalizeFileUri(filePath);
        this.baseline.set(normalizedPath, diagnosticFile.diagnostics);
        this.lastProcessedTimestamps.set(normalizedPath, timestamp);
      } else {
        const normalizedPath = this.normalizeFileUri(filePath);
        this.baseline.set(normalizedPath, []);
        this.lastProcessedTimestamps.set(normalizedPath, timestamp);
      }
    } catch (_error) {
    }
  }
  /**
   * Get new diagnostics from file://, _claude_fs_right, and _claude_fs_ URIs that aren't in the baseline.
   * Only processes diagnostics for files that have been edited.
   */
  async getNewDiagnostics() {
    if (!this.initialized || !this.mcpClient || this.mcpClient.type !== "connected") {
      return [];
    }
    let allDiagnosticFiles = [];
    try {
      const result = await callIdeRpc(
        "getDiagnostics",
        {},
        // Empty params fetches all diagnostics
        this.mcpClient
      );
      allDiagnosticFiles = this.parseDiagnosticResult(result);
    } catch (_error) {
      return [];
    }
    const diagnosticsForFileUrisWithBaselines = allDiagnosticFiles.filter((file) => this.baseline.has(this.normalizeFileUri(file.uri))).filter((file) => file.uri.startsWith("file://"));
    const diagnosticsForClaudeFsRightUrisWithBaselinesMap = /* @__PURE__ */ new Map();
    allDiagnosticFiles.filter((file) => this.baseline.has(this.normalizeFileUri(file.uri))).filter((file) => file.uri.startsWith("_claude_fs_right:")).forEach((file) => {
      diagnosticsForClaudeFsRightUrisWithBaselinesMap.set(
        this.normalizeFileUri(file.uri),
        file
      );
    });
    const newDiagnosticFiles = [];
    for (const file of diagnosticsForFileUrisWithBaselines) {
      const normalizedPath = this.normalizeFileUri(file.uri);
      const baselineDiagnostics = this.baseline.get(normalizedPath) || [];
      const claudeFsRightFile = diagnosticsForClaudeFsRightUrisWithBaselinesMap.get(normalizedPath);
      let fileToUse = file;
      if (claudeFsRightFile) {
        const previousRightDiagnostics = this.rightFileDiagnosticsState.get(normalizedPath);
        if (!previousRightDiagnostics || !this.areDiagnosticArraysEqual(
          previousRightDiagnostics,
          claudeFsRightFile.diagnostics
        )) {
          fileToUse = claudeFsRightFile;
        }
        this.rightFileDiagnosticsState.set(
          normalizedPath,
          claudeFsRightFile.diagnostics
        );
      }
      const newDiagnostics = fileToUse.diagnostics.filter(
        (d) => !baselineDiagnostics.some((b) => this.areDiagnosticsEqual(d, b))
      );
      if (newDiagnostics.length > 0) {
        newDiagnosticFiles.push({
          uri: file.uri,
          diagnostics: newDiagnostics
        });
      }
      this.baseline.set(normalizedPath, fileToUse.diagnostics);
    }
    return newDiagnosticFiles;
  }
  parseDiagnosticResult(result) {
    if (Array.isArray(result)) {
      const textBlock = result.find((block) => block.type === "text");
      if (textBlock && "text" in textBlock) {
        const parsed = jsonParse(textBlock.text);
        return parsed;
      }
    }
    return [];
  }
  areDiagnosticsEqual(a, b) {
    return a.message === b.message && a.severity === b.severity && a.source === b.source && a.code === b.code && a.range.start.line === b.range.start.line && a.range.start.character === b.range.start.character && a.range.end.line === b.range.end.line && a.range.end.character === b.range.end.character;
  }
  areDiagnosticArraysEqual(a, b) {
    if (a.length !== b.length) return false;
    return a.every(
      (diagA) => b.some((diagB) => this.areDiagnosticsEqual(diagA, diagB))
    ) && b.every((diagB) => a.some((diagA) => this.areDiagnosticsEqual(diagA, diagB)));
  }
  /**
   * Handle the start of a new query. This method:
   * - Initializes the diagnostic tracker if not already initialized
   * - Resets the tracker if already initialized (for new query loops)
   * - Automatically finds the IDE client from the provided clients list
   *
   * @param clients Array of MCP clients that may include an IDE client
   * @param shouldQuery Whether a query is actually being made (not just a command)
   */
  async handleQueryStart(clients) {
    if (!this.initialized) {
      const connectedIdeClient = getConnectedIdeClient(clients);
      if (connectedIdeClient) {
        this.initialize(connectedIdeClient);
      }
    } else {
      this.reset();
    }
  }
  /**
   * Format diagnostics into a human-readable summary string.
   * This is useful for displaying diagnostics in messages or logs.
   *
   * @param files Array of diagnostic files to format
   * @returns Formatted string representation of the diagnostics
   */
  static formatDiagnosticsSummary(files) {
    const truncationMarker = "\u2026[truncated]";
    const result = files.map((file) => {
      const filename = file.uri.split("/").pop() || file.uri;
      const diagnostics = file.diagnostics.map((d) => {
        const severitySymbol = DiagnosticTrackingService.getSeveritySymbol(
          d.severity
        );
        return `  ${severitySymbol} [Line ${d.range.start.line + 1}:${d.range.start.character + 1}] ${d.message}${d.code ? ` [${d.code}]` : ""}${d.source ? ` (${d.source})` : ""}`;
      }).join("\n");
      return `${filename}:
${diagnostics}`;
    }).join("\n\n");
    if (result.length > MAX_DIAGNOSTICS_SUMMARY_CHARS) {
      return result.slice(
        0,
        MAX_DIAGNOSTICS_SUMMARY_CHARS - truncationMarker.length
      ) + truncationMarker;
    }
    return result;
  }
  /**
   * Get the severity symbol for a diagnostic
   */
  static getSeveritySymbol(severity) {
    return {
      Error: figures.cross,
      Warning: figures.warning,
      Info: figures.info,
      Hint: figures.star
    }[severity] || figures.bullet;
  }
}
const diagnosticTracker = DiagnosticTrackingService.getInstance();
export {
  DiagnosticTrackingService,
  diagnosticTracker
};
