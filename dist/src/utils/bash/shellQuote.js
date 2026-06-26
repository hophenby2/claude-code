import {
  parse as shellQuoteParse,
  quote as shellQuoteQuote
} from "shell-quote";
import { logError } from "../log.js";
import { jsonStringify } from "../slowOperations.js";
function tryParseShellCommand(cmd, env) {
  try {
    const tokens = typeof env === "function" ? shellQuoteParse(cmd, env) : shellQuoteParse(cmd, env);
    return { success: true, tokens };
  } catch (error) {
    if (error instanceof Error) {
      logError(error);
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown parse error"
    };
  }
}
function tryQuoteShellArgs(args) {
  try {
    const validated = args.map((arg, index) => {
      if (arg === null || arg === void 0) {
        return String(arg);
      }
      const type = typeof arg;
      if (type === "string") {
        return arg;
      }
      if (type === "number" || type === "boolean") {
        return String(arg);
      }
      if (type === "object") {
        throw new Error(
          `Cannot quote argument at index ${index}: object values are not supported`
        );
      }
      if (type === "symbol") {
        throw new Error(
          `Cannot quote argument at index ${index}: symbol values are not supported`
        );
      }
      if (type === "function") {
        throw new Error(
          `Cannot quote argument at index ${index}: function values are not supported`
        );
      }
      throw new Error(
        `Cannot quote argument at index ${index}: unsupported type ${type}`
      );
    });
    const quoted = shellQuoteQuote(validated);
    return { success: true, quoted };
  } catch (error) {
    if (error instanceof Error) {
      logError(error);
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown quote error"
    };
  }
}
function hasMalformedTokens(command, parsed) {
  let inSingle = false;
  let inDouble = false;
  let doubleCount = 0;
  let singleCount = 0;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (c === "\\" && !inSingle) {
      i++;
      continue;
    }
    if (c === '"' && !inSingle) {
      doubleCount++;
      inDouble = !inDouble;
    } else if (c === "'" && !inDouble) {
      singleCount++;
      inSingle = !inSingle;
    }
  }
  if (doubleCount % 2 !== 0 || singleCount % 2 !== 0) return true;
  for (const entry of parsed) {
    if (typeof entry !== "string") continue;
    const openBraces = (entry.match(/{/g) || []).length;
    const closeBraces = (entry.match(/}/g) || []).length;
    if (openBraces !== closeBraces) return true;
    const openParens = (entry.match(/\(/g) || []).length;
    const closeParens = (entry.match(/\)/g) || []).length;
    if (openParens !== closeParens) return true;
    const openBrackets = (entry.match(/\[/g) || []).length;
    const closeBrackets = (entry.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) return true;
    const doubleQuotes = entry.match(/(?<!\\)"/g) || [];
    if (doubleQuotes.length % 2 !== 0) return true;
    const singleQuotes = entry.match(/(?<!\\)'/g) || [];
    if (singleQuotes.length % 2 !== 0) return true;
  }
  return false;
}
function hasShellQuoteSingleQuoteBug(command) {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (char === "\\" && !inSingleQuote) {
      i++;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      if (!inSingleQuote) {
        let backslashCount = 0;
        let j = i - 1;
        while (j >= 0 && command[j] === "\\") {
          backslashCount++;
          j--;
        }
        if (backslashCount > 0 && backslashCount % 2 === 1) {
          return true;
        }
        if (backslashCount > 0 && backslashCount % 2 === 0 && command.indexOf("'", i + 1) !== -1) {
          return true;
        }
      }
      continue;
    }
  }
  return false;
}
function quote(args) {
  const result = tryQuoteShellArgs([...args]);
  if (result.success) {
    return result.quoted;
  }
  try {
    const stringArgs = args.map((arg) => {
      if (arg === null || arg === void 0) {
        return String(arg);
      }
      const type = typeof arg;
      if (type === "string" || type === "number" || type === "boolean") {
        return String(arg);
      }
      return jsonStringify(arg);
    });
    return shellQuoteQuote(stringArgs);
  } catch (error) {
    if (error instanceof Error) {
      logError(error);
    }
    throw new Error("Failed to quote shell arguments safely");
  }
}
export {
  hasMalformedTokens,
  hasShellQuoteSingleQuoteBug,
  quote,
  tryParseShellCommand,
  tryQuoteShellArgs
};
