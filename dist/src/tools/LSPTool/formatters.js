import { relative } from "path";
import { logForDebugging } from "../../utils/debug.js";
import { errorMessage } from "../../utils/errors.js";
import { plural } from "../../utils/stringUtils.js";
function formatUri(uri, cwd) {
  if (!uri) {
    logForDebugging(
      "formatUri called with undefined URI - indicates malformed LSP server response",
      { level: "warn" }
    );
    return "<unknown location>";
  }
  let filePath = uri.replace(/^file:\/\//, "");
  if (/^\/[A-Za-z]:/.test(filePath)) {
    filePath = filePath.slice(1);
  }
  try {
    filePath = decodeURIComponent(filePath);
  } catch (error) {
    const errorMsg = errorMessage(error);
    logForDebugging(
      `Failed to decode LSP URI '${uri}': ${errorMsg}. Using un-decoded path: ${filePath}`,
      { level: "warn" }
    );
  }
  if (cwd) {
    const relativePath = relative(cwd, filePath).replaceAll("\\", "/");
    if (relativePath.length < filePath.length && !relativePath.startsWith("../../")) {
      return relativePath;
    }
  }
  return filePath.replaceAll("\\", "/");
}
function groupByFile(items, cwd) {
  const byFile = /* @__PURE__ */ new Map();
  for (const item of items) {
    const uri = "uri" in item ? item.uri : item.location.uri;
    const filePath = formatUri(uri, cwd);
    const existingItems = byFile.get(filePath);
    if (existingItems) {
      existingItems.push(item);
    } else {
      byFile.set(filePath, [item]);
    }
  }
  return byFile;
}
function formatLocation(location, cwd) {
  const filePath = formatUri(location.uri, cwd);
  const line = location.range.start.line + 1;
  const character = location.range.start.character + 1;
  return `${filePath}:${line}:${character}`;
}
function locationLinkToLocation(link) {
  return {
    uri: link.targetUri,
    range: link.targetSelectionRange || link.targetRange
  };
}
function isLocationLink(item) {
  return "targetUri" in item;
}
function formatGoToDefinitionResult(result, cwd) {
  if (!result) {
    return "No definition found. This may occur if the cursor is not on a symbol, or if the definition is in an external library not indexed by the LSP server.";
  }
  if (Array.isArray(result)) {
    const locations = result.map(
      (item) => isLocationLink(item) ? locationLinkToLocation(item) : item
    );
    const invalidLocations = locations.filter((loc) => !loc || !loc.uri);
    if (invalidLocations.length > 0) {
      logForDebugging(
        `formatGoToDefinitionResult: Filtering out ${invalidLocations.length} invalid location(s) - this should have been caught earlier`,
        { level: "warn" }
      );
    }
    const validLocations = locations.filter((loc) => loc && loc.uri);
    if (validLocations.length === 0) {
      return "No definition found. This may occur if the cursor is not on a symbol, or if the definition is in an external library not indexed by the LSP server.";
    }
    if (validLocations.length === 1) {
      return `Defined in ${formatLocation(validLocations[0], cwd)}`;
    }
    const locationList = validLocations.map((loc) => `  ${formatLocation(loc, cwd)}`).join("\n");
    return `Found ${validLocations.length} definitions:
${locationList}`;
  }
  const location = isLocationLink(result) ? locationLinkToLocation(result) : result;
  return `Defined in ${formatLocation(location, cwd)}`;
}
function formatFindReferencesResult(result, cwd) {
  if (!result || result.length === 0) {
    return "No references found. This may occur if the symbol has no usages, or if the LSP server has not fully indexed the workspace.";
  }
  const invalidLocations = result.filter((loc) => !loc || !loc.uri);
  if (invalidLocations.length > 0) {
    logForDebugging(
      `formatFindReferencesResult: Filtering out ${invalidLocations.length} invalid location(s) - this should have been caught earlier`,
      { level: "warn" }
    );
  }
  const validLocations = result.filter((loc) => loc && loc.uri);
  if (validLocations.length === 0) {
    return "No references found. This may occur if the symbol has no usages, or if the LSP server has not fully indexed the workspace.";
  }
  if (validLocations.length === 1) {
    return `Found 1 reference:
  ${formatLocation(validLocations[0], cwd)}`;
  }
  const byFile = groupByFile(validLocations, cwd);
  const lines = [
    `Found ${validLocations.length} references across ${byFile.size} files:`
  ];
  for (const [filePath, locations] of byFile) {
    lines.push(`
${filePath}:`);
    for (const loc of locations) {
      const line = loc.range.start.line + 1;
      const character = loc.range.start.character + 1;
      lines.push(`  Line ${line}:${character}`);
    }
  }
  return lines.join("\n");
}
function extractMarkupText(contents) {
  if (Array.isArray(contents)) {
    return contents.map((item) => {
      if (typeof item === "string") {
        return item;
      }
      return item.value;
    }).join("\n\n");
  }
  if (typeof contents === "string") {
    return contents;
  }
  if ("kind" in contents) {
    return contents.value;
  }
  return contents.value;
}
function formatHoverResult(result, _cwd) {
  if (!result) {
    return "No hover information available. This may occur if the cursor is not on a symbol, or if the LSP server has not fully indexed the file.";
  }
  const content = extractMarkupText(result.contents);
  if (result.range) {
    const line = result.range.start.line + 1;
    const character = result.range.start.character + 1;
    return `Hover info at ${line}:${character}:

${content}`;
  }
  return content;
}
function symbolKindToString(kind) {
  const kinds = {
    [1]: "File",
    [2]: "Module",
    [3]: "Namespace",
    [4]: "Package",
    [5]: "Class",
    [6]: "Method",
    [7]: "Property",
    [8]: "Field",
    [9]: "Constructor",
    [10]: "Enum",
    [11]: "Interface",
    [12]: "Function",
    [13]: "Variable",
    [14]: "Constant",
    [15]: "String",
    [16]: "Number",
    [17]: "Boolean",
    [18]: "Array",
    [19]: "Object",
    [20]: "Key",
    [21]: "Null",
    [22]: "EnumMember",
    [23]: "Struct",
    [24]: "Event",
    [25]: "Operator",
    [26]: "TypeParameter"
  };
  return kinds[kind] || "Unknown";
}
function formatDocumentSymbolNode(symbol, indent = 0) {
  const lines = [];
  const prefix = "  ".repeat(indent);
  const kind = symbolKindToString(symbol.kind);
  let line = `${prefix}${symbol.name} (${kind})`;
  if (symbol.detail) {
    line += ` ${symbol.detail}`;
  }
  const symbolLine = symbol.range.start.line + 1;
  line += ` - Line ${symbolLine}`;
  lines.push(line);
  if (symbol.children && symbol.children.length > 0) {
    for (const child of symbol.children) {
      lines.push(...formatDocumentSymbolNode(child, indent + 1));
    }
  }
  return lines;
}
function formatDocumentSymbolResult(result, cwd) {
  if (!result || result.length === 0) {
    return "No symbols found in document. This may occur if the file is empty, not supported by the LSP server, or if the server has not fully indexed the file.";
  }
  const firstSymbol = result[0];
  const isSymbolInformation = firstSymbol && "location" in firstSymbol;
  if (isSymbolInformation) {
    return formatWorkspaceSymbolResult(result, cwd);
  }
  const lines = ["Document symbols:"];
  for (const symbol of result) {
    lines.push(...formatDocumentSymbolNode(symbol));
  }
  return lines.join("\n");
}
function formatWorkspaceSymbolResult(result, cwd) {
  if (!result || result.length === 0) {
    return "No symbols found in workspace. This may occur if the workspace is empty, or if the LSP server has not finished indexing the project.";
  }
  const invalidSymbols = result.filter(
    (sym) => !sym || !sym.location || !sym.location.uri
  );
  if (invalidSymbols.length > 0) {
    logForDebugging(
      `formatWorkspaceSymbolResult: Filtering out ${invalidSymbols.length} invalid symbol(s) - this should have been caught earlier`,
      { level: "warn" }
    );
  }
  const validSymbols = result.filter(
    (sym) => sym && sym.location && sym.location.uri
  );
  if (validSymbols.length === 0) {
    return "No symbols found in workspace. This may occur if the workspace is empty, or if the LSP server has not finished indexing the project.";
  }
  const lines = [
    `Found ${validSymbols.length} ${plural(validSymbols.length, "symbol")} in workspace:`
  ];
  const byFile = groupByFile(validSymbols, cwd);
  for (const [filePath, symbols] of byFile) {
    lines.push(`
${filePath}:`);
    for (const symbol of symbols) {
      const kind = symbolKindToString(symbol.kind);
      const line = symbol.location.range.start.line + 1;
      let symbolLine = `  ${symbol.name} (${kind}) - Line ${line}`;
      if (symbol.containerName) {
        symbolLine += ` in ${symbol.containerName}`;
      }
      lines.push(symbolLine);
    }
  }
  return lines.join("\n");
}
function formatCallHierarchyItem(item, cwd) {
  if (!item.uri) {
    logForDebugging(
      "formatCallHierarchyItem: CallHierarchyItem has undefined URI",
      { level: "warn" }
    );
    return `${item.name} (${symbolKindToString(item.kind)}) - <unknown location>`;
  }
  const filePath = formatUri(item.uri, cwd);
  const line = item.range.start.line + 1;
  const kind = symbolKindToString(item.kind);
  let result = `${item.name} (${kind}) - ${filePath}:${line}`;
  if (item.detail) {
    result += ` [${item.detail}]`;
  }
  return result;
}
function formatPrepareCallHierarchyResult(result, cwd) {
  if (!result || result.length === 0) {
    return "No call hierarchy item found at this position";
  }
  if (result.length === 1) {
    return `Call hierarchy item: ${formatCallHierarchyItem(result[0], cwd)}`;
  }
  const lines = [`Found ${result.length} call hierarchy items:`];
  for (const item of result) {
    lines.push(`  ${formatCallHierarchyItem(item, cwd)}`);
  }
  return lines.join("\n");
}
function formatIncomingCallsResult(result, cwd) {
  if (!result || result.length === 0) {
    return "No incoming calls found (nothing calls this function)";
  }
  const lines = [
    `Found ${result.length} incoming ${plural(result.length, "call")}:`
  ];
  const byFile = /* @__PURE__ */ new Map();
  for (const call of result) {
    if (!call.from) {
      logForDebugging(
        "formatIncomingCallsResult: CallHierarchyIncomingCall has undefined from field",
        { level: "warn" }
      );
      continue;
    }
    const filePath = formatUri(call.from.uri, cwd);
    const existing = byFile.get(filePath);
    if (existing) {
      existing.push(call);
    } else {
      byFile.set(filePath, [call]);
    }
  }
  for (const [filePath, calls] of byFile) {
    lines.push(`
${filePath}:`);
    for (const call of calls) {
      if (!call.from) {
        continue;
      }
      const kind = symbolKindToString(call.from.kind);
      const line = call.from.range.start.line + 1;
      let callLine = `  ${call.from.name} (${kind}) - Line ${line}`;
      if (call.fromRanges && call.fromRanges.length > 0) {
        const callSites = call.fromRanges.map((r) => `${r.start.line + 1}:${r.start.character + 1}`).join(", ");
        callLine += ` [calls at: ${callSites}]`;
      }
      lines.push(callLine);
    }
  }
  return lines.join("\n");
}
function formatOutgoingCallsResult(result, cwd) {
  if (!result || result.length === 0) {
    return "No outgoing calls found (this function calls nothing)";
  }
  const lines = [
    `Found ${result.length} outgoing ${plural(result.length, "call")}:`
  ];
  const byFile = /* @__PURE__ */ new Map();
  for (const call of result) {
    if (!call.to) {
      logForDebugging(
        "formatOutgoingCallsResult: CallHierarchyOutgoingCall has undefined to field",
        { level: "warn" }
      );
      continue;
    }
    const filePath = formatUri(call.to.uri, cwd);
    const existing = byFile.get(filePath);
    if (existing) {
      existing.push(call);
    } else {
      byFile.set(filePath, [call]);
    }
  }
  for (const [filePath, calls] of byFile) {
    lines.push(`
${filePath}:`);
    for (const call of calls) {
      if (!call.to) {
        continue;
      }
      const kind = symbolKindToString(call.to.kind);
      const line = call.to.range.start.line + 1;
      let callLine = `  ${call.to.name} (${kind}) - Line ${line}`;
      if (call.fromRanges && call.fromRanges.length > 0) {
        const callSites = call.fromRanges.map((r) => `${r.start.line + 1}:${r.start.character + 1}`).join(", ");
        callLine += ` [called from: ${callSites}]`;
      }
      lines.push(callLine);
    }
  }
  return lines.join("\n");
}
export {
  formatDocumentSymbolResult,
  formatFindReferencesResult,
  formatGoToDefinitionResult,
  formatHoverResult,
  formatIncomingCallsResult,
  formatOutgoingCallsResult,
  formatPrepareCallHierarchyResult,
  formatWorkspaceSymbolResult
};
