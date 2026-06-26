import { open } from "fs/promises";
import * as path from "path";
import { pathToFileURL } from "url";
import { z } from "zod/v4";
import {
  getInitializationStatus,
  getLspServerManager,
  isLspConnected,
  waitForInitialization
} from "../../services/lsp/manager.js";
import { buildTool } from "../../Tool.js";
import { uniq } from "../../utils/array.js";
import { getCwd } from "../../utils/cwd.js";
import { logForDebugging } from "../../utils/debug.js";
import { isENOENT, toError } from "../../utils/errors.js";
import { execFileNoThrowWithCwd } from "../../utils/execFileNoThrow.js";
import { getFsImplementation } from "../../utils/fsOperations.js";
import { lazySchema } from "../../utils/lazySchema.js";
import { logError } from "../../utils/log.js";
import { expandPath } from "../../utils/path.js";
import { checkReadPermissionForTool } from "../../utils/permissions/filesystem.js";
import {
  formatDocumentSymbolResult,
  formatFindReferencesResult,
  formatGoToDefinitionResult,
  formatHoverResult,
  formatIncomingCallsResult,
  formatOutgoingCallsResult,
  formatPrepareCallHierarchyResult,
  formatWorkspaceSymbolResult
} from "./formatters.js";
import { DESCRIPTION, LSP_TOOL_NAME } from "./prompt.js";
import { lspToolInputSchema } from "./schemas.js";
import {
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  userFacingName
} from "./UI.js";
const MAX_LSP_FILE_SIZE_BYTES = 1e7;
const inputSchema = lazySchema(
  () => z.strictObject({
    operation: z.enum([
      "goToDefinition",
      "findReferences",
      "hover",
      "documentSymbol",
      "workspaceSymbol",
      "goToImplementation",
      "prepareCallHierarchy",
      "incomingCalls",
      "outgoingCalls"
    ]).describe("The LSP operation to perform"),
    filePath: z.string().describe("The absolute or relative path to the file"),
    line: z.number().int().positive().describe("The line number (1-based, as shown in editors)"),
    character: z.number().int().positive().describe("The character offset (1-based, as shown in editors)")
  })
);
const outputSchema = lazySchema(
  () => z.object({
    operation: z.enum([
      "goToDefinition",
      "findReferences",
      "hover",
      "documentSymbol",
      "workspaceSymbol",
      "goToImplementation",
      "prepareCallHierarchy",
      "incomingCalls",
      "outgoingCalls"
    ]).describe("The LSP operation that was performed"),
    result: z.string().describe("The formatted result of the LSP operation"),
    filePath: z.string().describe("The file path the operation was performed on"),
    resultCount: z.number().int().nonnegative().optional().describe("Number of results (definitions, references, symbols)"),
    fileCount: z.number().int().nonnegative().optional().describe("Number of files containing results")
  })
);
const LSPTool = buildTool({
  name: LSP_TOOL_NAME,
  searchHint: "code intelligence (definitions, references, symbols, hover)",
  maxResultSizeChars: 1e5,
  isLsp: true,
  async description() {
    return DESCRIPTION;
  },
  userFacingName,
  shouldDefer: true,
  isEnabled() {
    return isLspConnected();
  },
  get inputSchema() {
    return inputSchema();
  },
  get outputSchema() {
    return outputSchema();
  },
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  getPath({ filePath }) {
    return expandPath(filePath);
  },
  async validateInput(input) {
    const parseResult = lspToolInputSchema().safeParse(input);
    if (!parseResult.success) {
      return {
        result: false,
        message: `Invalid input: ${parseResult.error.message}`,
        errorCode: 3
      };
    }
    const fs = getFsImplementation();
    const absolutePath = expandPath(input.filePath);
    if (absolutePath.startsWith("\\\\") || absolutePath.startsWith("//")) {
      return { result: true };
    }
    let stats;
    try {
      stats = await fs.stat(absolutePath);
    } catch (error) {
      if (isENOENT(error)) {
        return {
          result: false,
          message: `File does not exist: ${input.filePath}`,
          errorCode: 1
        };
      }
      const err = toError(error);
      logError(
        new Error(
          `Failed to access file stats for LSP operation on ${input.filePath}: ${err.message}`
        )
      );
      return {
        result: false,
        message: `Cannot access file: ${input.filePath}. ${err.message}`,
        errorCode: 4
      };
    }
    if (!stats.isFile()) {
      return {
        result: false,
        message: `Path is not a file: ${input.filePath}`,
        errorCode: 2
      };
    }
    return { result: true };
  },
  async checkPermissions(input, context) {
    const appState = context.getAppState();
    return checkReadPermissionForTool(
      LSPTool,
      input,
      appState.toolPermissionContext
    );
  },
  async prompt() {
    return DESCRIPTION;
  },
  renderToolUseMessage,
  renderToolUseErrorMessage,
  renderToolResultMessage,
  async call(input, _context) {
    const absolutePath = expandPath(input.filePath);
    const cwd = getCwd();
    const status = getInitializationStatus();
    if (status.status === "pending") {
      await waitForInitialization();
    }
    const manager = getLspServerManager();
    if (!manager) {
      logError(
        new Error("LSP server manager not initialized when tool was called")
      );
      const output = {
        operation: input.operation,
        result: "LSP server manager not initialized. This may indicate a startup issue.",
        filePath: input.filePath
      };
      return {
        data: output
      };
    }
    const { method, params } = getMethodAndParams(input, absolutePath);
    try {
      if (!manager.isFileOpen(absolutePath)) {
        const handle = await open(absolutePath, "r");
        try {
          const stats = await handle.stat();
          if (stats.size > MAX_LSP_FILE_SIZE_BYTES) {
            const output2 = {
              operation: input.operation,
              result: `File too large for LSP analysis (${Math.ceil(stats.size / 1e6)}MB exceeds 10MB limit)`,
              filePath: input.filePath
            };
            return { data: output2 };
          }
          const fileContent = await handle.readFile({ encoding: "utf-8" });
          await manager.openFile(absolutePath, fileContent);
        } finally {
          await handle.close();
        }
      }
      let result = await manager.sendRequest(absolutePath, method, params);
      if (result === void 0) {
        logForDebugging(
          `No LSP server available for file type ${path.extname(absolutePath)} for operation ${input.operation} on file ${input.filePath}`
        );
        const output2 = {
          operation: input.operation,
          result: `No LSP server available for file type: ${path.extname(absolutePath)}`,
          filePath: input.filePath
        };
        return {
          data: output2
        };
      }
      if (input.operation === "incomingCalls" || input.operation === "outgoingCalls") {
        const callItems = result;
        if (!callItems || callItems.length === 0) {
          const output2 = {
            operation: input.operation,
            result: "No call hierarchy item found at this position",
            filePath: input.filePath,
            resultCount: 0,
            fileCount: 0
          };
          return { data: output2 };
        }
        const callMethod = input.operation === "incomingCalls" ? "callHierarchy/incomingCalls" : "callHierarchy/outgoingCalls";
        result = await manager.sendRequest(absolutePath, callMethod, {
          item: callItems[0]
        });
        if (result === void 0) {
          logForDebugging(
            `LSP server returned undefined for ${callMethod} on ${input.filePath}`
          );
        }
      }
      if (result && Array.isArray(result) && (input.operation === "findReferences" || input.operation === "goToDefinition" || input.operation === "goToImplementation" || input.operation === "workspaceSymbol")) {
        if (input.operation === "workspaceSymbol") {
          const symbols = result;
          const locations = symbols.filter((s) => s?.location?.uri).map((s) => s.location);
          const filteredLocations = await filterGitIgnoredLocations(
            locations,
            cwd
          );
          const filteredUris = new Set(filteredLocations.map((l) => l.uri));
          result = symbols.filter(
            (s) => !s?.location?.uri || filteredUris.has(s.location.uri)
          );
        } else {
          const locations = result.map(
            toLocation
          );
          const filteredLocations = await filterGitIgnoredLocations(
            locations,
            cwd
          );
          const filteredUris = new Set(filteredLocations.map((l) => l.uri));
          result = result.filter((item) => {
            const loc = toLocation(item);
            return !loc.uri || filteredUris.has(loc.uri);
          });
        }
      }
      const { formatted, resultCount, fileCount } = formatResult(
        input.operation,
        result,
        cwd
      );
      const output = {
        operation: input.operation,
        result: formatted,
        filePath: input.filePath,
        resultCount,
        fileCount
      };
      return {
        data: output
      };
    } catch (error) {
      const err = toError(error);
      const errorMessage = err.message;
      logError(
        new Error(
          `LSP tool request failed for ${input.operation} on ${input.filePath}: ${errorMessage}`
        )
      );
      const output = {
        operation: input.operation,
        result: `Error performing ${input.operation}: ${errorMessage}`,
        filePath: input.filePath
      };
      return {
        data: output
      };
    }
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: "tool_result",
      content: output.result
    };
  }
});
function getMethodAndParams(input, absolutePath) {
  const uri = pathToFileURL(absolutePath).href;
  const position = {
    line: input.line - 1,
    character: input.character - 1
  };
  switch (input.operation) {
    case "goToDefinition":
      return {
        method: "textDocument/definition",
        params: {
          textDocument: { uri },
          position
        }
      };
    case "findReferences":
      return {
        method: "textDocument/references",
        params: {
          textDocument: { uri },
          position,
          context: { includeDeclaration: true }
        }
      };
    case "hover":
      return {
        method: "textDocument/hover",
        params: {
          textDocument: { uri },
          position
        }
      };
    case "documentSymbol":
      return {
        method: "textDocument/documentSymbol",
        params: {
          textDocument: { uri }
        }
      };
    case "workspaceSymbol":
      return {
        method: "workspace/symbol",
        params: {
          query: ""
          // Empty query returns all symbols
        }
      };
    case "goToImplementation":
      return {
        method: "textDocument/implementation",
        params: {
          textDocument: { uri },
          position
        }
      };
    case "prepareCallHierarchy":
      return {
        method: "textDocument/prepareCallHierarchy",
        params: {
          textDocument: { uri },
          position
        }
      };
    case "incomingCalls":
      return {
        method: "textDocument/prepareCallHierarchy",
        params: {
          textDocument: { uri },
          position
        }
      };
    case "outgoingCalls":
      return {
        method: "textDocument/prepareCallHierarchy",
        params: {
          textDocument: { uri },
          position
        }
      };
  }
}
function countSymbols(symbols) {
  let count = symbols.length;
  for (const symbol of symbols) {
    if (symbol.children && symbol.children.length > 0) {
      count += countSymbols(symbol.children);
    }
  }
  return count;
}
function countUniqueFiles(locations) {
  return new Set(locations.map((loc) => loc.uri)).size;
}
function uriToFilePath(uri) {
  let filePath = uri.replace(/^file:\/\//, "");
  if (/^\/[A-Za-z]:/.test(filePath)) {
    filePath = filePath.slice(1);
  }
  try {
    filePath = decodeURIComponent(filePath);
  } catch {
  }
  return filePath;
}
async function filterGitIgnoredLocations(locations, cwd) {
  if (locations.length === 0) {
    return locations;
  }
  const uriToPath = /* @__PURE__ */ new Map();
  for (const loc of locations) {
    if (loc.uri && !uriToPath.has(loc.uri)) {
      uriToPath.set(loc.uri, uriToFilePath(loc.uri));
    }
  }
  const uniquePaths = uniq(uriToPath.values());
  if (uniquePaths.length === 0) {
    return locations;
  }
  const ignoredPaths = /* @__PURE__ */ new Set();
  const BATCH_SIZE = 50;
  for (let i = 0; i < uniquePaths.length; i += BATCH_SIZE) {
    const batch = uniquePaths.slice(i, i + BATCH_SIZE);
    const result = await execFileNoThrowWithCwd(
      "git",
      ["check-ignore", ...batch],
      {
        cwd,
        preserveOutputOnError: false,
        timeout: 5e3
      }
    );
    if (result.code === 0 && result.stdout) {
      for (const line of result.stdout.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) {
          ignoredPaths.add(trimmed);
        }
      }
    }
  }
  if (ignoredPaths.size === 0) {
    return locations;
  }
  return locations.filter((loc) => {
    const filePath = uriToPath.get(loc.uri);
    return !filePath || !ignoredPaths.has(filePath);
  });
}
function isLocationLink(item) {
  return "targetUri" in item;
}
function toLocation(item) {
  if (isLocationLink(item)) {
    return {
      uri: item.targetUri,
      range: item.targetSelectionRange || item.targetRange
    };
  }
  return item;
}
function formatResult(operation, result, cwd) {
  switch (operation) {
    case "goToDefinition": {
      const rawResults = Array.isArray(result) ? result : result ? [result] : [];
      const locations = rawResults.map(toLocation);
      const invalidLocations = locations.filter((loc) => !loc || !loc.uri);
      if (invalidLocations.length > 0) {
        logError(
          new Error(
            `LSP server returned ${invalidLocations.length} location(s) with undefined URI for goToDefinition on ${cwd}. This indicates malformed data from the LSP server.`
          )
        );
      }
      const validLocations = locations.filter((loc) => loc && loc.uri);
      return {
        formatted: formatGoToDefinitionResult(
          result,
          cwd
        ),
        resultCount: validLocations.length,
        fileCount: countUniqueFiles(validLocations)
      };
    }
    case "findReferences": {
      const locations = result || [];
      const invalidLocations = locations.filter((loc) => !loc || !loc.uri);
      if (invalidLocations.length > 0) {
        logError(
          new Error(
            `LSP server returned ${invalidLocations.length} location(s) with undefined URI for findReferences on ${cwd}. This indicates malformed data from the LSP server.`
          )
        );
      }
      const validLocations = locations.filter((loc) => loc && loc.uri);
      return {
        formatted: formatFindReferencesResult(result, cwd),
        resultCount: validLocations.length,
        fileCount: countUniqueFiles(validLocations)
      };
    }
    case "hover": {
      return {
        formatted: formatHoverResult(result, cwd),
        resultCount: result ? 1 : 0,
        fileCount: result ? 1 : 0
      };
    }
    case "documentSymbol": {
      const symbols = result || [];
      const isDocumentSymbol = symbols.length > 0 && symbols[0] && "range" in symbols[0];
      const count = isDocumentSymbol ? countSymbols(symbols) : symbols.length;
      return {
        formatted: formatDocumentSymbolResult(
          result,
          cwd
        ),
        resultCount: count,
        fileCount: symbols.length > 0 ? 1 : 0
      };
    }
    case "workspaceSymbol": {
      const symbols = result || [];
      const invalidSymbols = symbols.filter(
        (sym) => !sym || !sym.location || !sym.location.uri
      );
      if (invalidSymbols.length > 0) {
        logError(
          new Error(
            `LSP server returned ${invalidSymbols.length} symbol(s) with undefined location URI for workspaceSymbol on ${cwd}. This indicates malformed data from the LSP server.`
          )
        );
      }
      const validSymbols = symbols.filter(
        (sym) => sym && sym.location && sym.location.uri
      );
      const locations = validSymbols.map((s) => s.location);
      return {
        formatted: formatWorkspaceSymbolResult(
          result,
          cwd
        ),
        resultCount: validSymbols.length,
        fileCount: countUniqueFiles(locations)
      };
    }
    case "goToImplementation": {
      const rawResults = Array.isArray(result) ? result : result ? [result] : [];
      const locations = rawResults.map(toLocation);
      const invalidLocations = locations.filter((loc) => !loc || !loc.uri);
      if (invalidLocations.length > 0) {
        logError(
          new Error(
            `LSP server returned ${invalidLocations.length} location(s) with undefined URI for goToImplementation on ${cwd}. This indicates malformed data from the LSP server.`
          )
        );
      }
      const validLocations = locations.filter((loc) => loc && loc.uri);
      return {
        // Reuse goToDefinition formatter since the result format is identical
        formatted: formatGoToDefinitionResult(
          result,
          cwd
        ),
        resultCount: validLocations.length,
        fileCount: countUniqueFiles(validLocations)
      };
    }
    case "prepareCallHierarchy": {
      const items = result || [];
      return {
        formatted: formatPrepareCallHierarchyResult(
          result,
          cwd
        ),
        resultCount: items.length,
        fileCount: items.length > 0 ? countUniqueFilesFromCallItems(items) : 0
      };
    }
    case "incomingCalls": {
      const calls = result || [];
      return {
        formatted: formatIncomingCallsResult(
          result,
          cwd
        ),
        resultCount: calls.length,
        fileCount: calls.length > 0 ? countUniqueFilesFromIncomingCalls(calls) : 0
      };
    }
    case "outgoingCalls": {
      const calls = result || [];
      return {
        formatted: formatOutgoingCallsResult(
          result,
          cwd
        ),
        resultCount: calls.length,
        fileCount: calls.length > 0 ? countUniqueFilesFromOutgoingCalls(calls) : 0
      };
    }
  }
}
function countUniqueFilesFromCallItems(items) {
  const validUris = items.map((item) => item.uri).filter((uri) => uri);
  return new Set(validUris).size;
}
function countUniqueFilesFromIncomingCalls(calls) {
  const validUris = calls.map((call) => call.from?.uri).filter((uri) => uri);
  return new Set(validUris).size;
}
function countUniqueFilesFromOutgoingCalls(calls) {
  const validUris = calls.map((call) => call.to?.uri).filter((uri) => uri);
  return new Set(validUris).size;
}
export {
  LSPTool
};
