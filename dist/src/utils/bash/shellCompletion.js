import {
  quote,
  tryParseShellCommand
} from "../bash/shellQuote.js";
import { logForDebugging } from "../debug.js";
import { getShellType } from "../localInstaller.js";
import * as Shell from "../Shell.js";
const MAX_SHELL_COMPLETIONS = 15;
const SHELL_COMPLETION_TIMEOUT_MS = 1e3;
const COMMAND_OPERATORS = ["|", "||", "&&", ";"];
function isCommandOperator(token) {
  return typeof token === "object" && token !== null && "op" in token && COMMAND_OPERATORS.includes(token.op);
}
function getCompletionTypeFromPrefix(prefix) {
  if (prefix.startsWith("$")) {
    return "variable";
  }
  if (prefix.includes("/") || prefix.startsWith("~") || prefix.startsWith(".")) {
    return "file";
  }
  return "command";
}
function findLastStringToken(tokens) {
  const i = tokens.findLastIndex((t) => typeof t === "string");
  return i !== -1 ? { token: tokens[i], index: i } : null;
}
function isNewCommandContext(tokens, currentTokenIndex) {
  if (currentTokenIndex === 0) {
    return true;
  }
  const prevToken = tokens[currentTokenIndex - 1];
  return prevToken !== void 0 && isCommandOperator(prevToken);
}
function parseInputContext(input, cursorOffset) {
  const beforeCursor = input.slice(0, cursorOffset);
  const varMatch = beforeCursor.match(/\$[a-zA-Z_][a-zA-Z0-9_]*$/);
  if (varMatch) {
    return { prefix: varMatch[0], completionType: "variable" };
  }
  const parseResult = tryParseShellCommand(beforeCursor);
  if (!parseResult.success) {
    const tokens = beforeCursor.split(/\s+/);
    const prefix = tokens[tokens.length - 1] || "";
    const isFirstToken = tokens.length === 1 && !beforeCursor.includes(" ");
    const completionType2 = isFirstToken ? "command" : getCompletionTypeFromPrefix(prefix);
    return { prefix, completionType: completionType2 };
  }
  const lastToken = findLastStringToken(parseResult.tokens);
  if (!lastToken) {
    const lastParsedToken = parseResult.tokens[parseResult.tokens.length - 1];
    const completionType2 = lastParsedToken && isCommandOperator(lastParsedToken) ? "command" : "command";
    return { prefix: "", completionType: completionType2 };
  }
  if (beforeCursor.endsWith(" ")) {
    return { prefix: "", completionType: "file" };
  }
  const baseType = getCompletionTypeFromPrefix(lastToken.token);
  if (baseType === "variable" || baseType === "file") {
    return { prefix: lastToken.token, completionType: baseType };
  }
  const completionType = isNewCommandContext(
    parseResult.tokens,
    lastToken.index
  ) ? "command" : "file";
  return { prefix: lastToken.token, completionType };
}
function getBashCompletionCommand(prefix, completionType) {
  if (completionType === "variable") {
    const varName = prefix.slice(1);
    return `compgen -v ${quote([varName])} 2>/dev/null`;
  } else if (completionType === "file") {
    return `compgen -f ${quote([prefix])} 2>/dev/null | head -${MAX_SHELL_COMPLETIONS} | while IFS= read -r f; do [ -d "$f" ] && echo "$f/" || echo "$f "; done`;
  } else {
    return `compgen -c ${quote([prefix])} 2>/dev/null`;
  }
}
function getZshCompletionCommand(prefix, completionType) {
  if (completionType === "variable") {
    const varName = prefix.slice(1);
    return `print -rl -- \${(k)parameters[(I)${quote([varName])}*]} 2>/dev/null`;
  } else if (completionType === "file") {
    return `for f in ${quote([prefix])}*(N[1,${MAX_SHELL_COMPLETIONS}]); do [[ -d "$f" ]] && echo "$f/" || echo "$f "; done`;
  } else {
    return `print -rl -- \${(k)commands[(I)${quote([prefix])}*]} 2>/dev/null`;
  }
}
async function getCompletionsForShell(shellType, prefix, completionType, abortSignal) {
  let command;
  if (shellType === "bash") {
    command = getBashCompletionCommand(prefix, completionType);
  } else if (shellType === "zsh") {
    command = getZshCompletionCommand(prefix, completionType);
  } else {
    return [];
  }
  const shellCommand = await Shell.exec(command, abortSignal, "bash", {
    timeout: SHELL_COMPLETION_TIMEOUT_MS
  });
  const result = await shellCommand.result;
  return result.stdout.split("\n").filter((line) => line.trim()).slice(0, MAX_SHELL_COMPLETIONS).map((text) => ({
    id: text,
    displayText: text,
    description: void 0,
    metadata: { completionType }
  }));
}
async function getShellCompletions(input, cursorOffset, abortSignal) {
  const shellType = getShellType();
  if (shellType !== "bash" && shellType !== "zsh") {
    return [];
  }
  try {
    const { prefix, completionType } = parseInputContext(input, cursorOffset);
    if (!prefix) {
      return [];
    }
    const completions = await getCompletionsForShell(
      shellType,
      prefix,
      completionType,
      abortSignal
    );
    return completions.map((suggestion) => ({
      ...suggestion,
      metadata: {
        ...suggestion.metadata,
        inputSnapshot: input
      }
    }));
  } catch (error) {
    logForDebugging(`Shell completion failed: ${error}`);
    return [];
  }
}
export {
  getShellCompletions
};
