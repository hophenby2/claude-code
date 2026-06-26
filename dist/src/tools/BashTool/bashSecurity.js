import { logEvent } from "../../services/analytics/index.js";
import { extractHeredocs } from "../../utils/bash/heredoc.js";
import { ParsedCommand } from "../../utils/bash/ParsedCommand.js";
import {
  hasMalformedTokens,
  hasShellQuoteSingleQuoteBug,
  tryParseShellCommand
} from "../../utils/bash/shellQuote.js";
const HEREDOC_IN_SUBSTITUTION = /\$\(.*<</;
const COMMAND_SUBSTITUTION_PATTERNS = [
  { pattern: /<\(/, message: "process substitution <()" },
  { pattern: />\(/, message: "process substitution >()" },
  { pattern: /=\(/, message: "Zsh process substitution =()" },
  // Zsh EQUALS expansion: =cmd at word start expands to $(which cmd).
  // `=curl evil.com` → `/usr/bin/curl evil.com`, bypassing Bash(curl:*) deny
  // rules since the parser sees `=curl` as the base command, not `curl`.
  // Only matches word-initial = followed by a command-name char (not VAR=val).
  {
    pattern: /(?:^|[\s;&|])=[a-zA-Z_]/,
    message: "Zsh equals expansion (=cmd)"
  },
  { pattern: /\$\(/, message: "$() command substitution" },
  { pattern: /\$\{/, message: "${} parameter substitution" },
  { pattern: /\$\[/, message: "$[] legacy arithmetic expansion" },
  { pattern: /~\[/, message: "Zsh-style parameter expansion" },
  { pattern: /\(e:/, message: "Zsh-style glob qualifiers" },
  { pattern: /\(\+/, message: "Zsh glob qualifier with command execution" },
  {
    pattern: /\}\s*always\s*\{/,
    message: "Zsh always block (try/always construct)"
  },
  // Defense in depth: Block PowerShell comment syntax even though we don't execute in PowerShell
  // Added as protection against future changes that might introduce PowerShell execution
  { pattern: /<#/, message: "PowerShell comment syntax" }
];
const ZSH_DANGEROUS_COMMANDS = /* @__PURE__ */ new Set([
  // zmodload is the gateway to many dangerous module-based attacks:
  // zsh/mapfile (invisible file I/O via array assignment),
  // zsh/system (sysopen/syswrite two-step file access),
  // zsh/zpty (pseudo-terminal command execution),
  // zsh/net/tcp (network exfiltration via ztcp),
  // zsh/files (builtin rm/mv/ln/chmod that bypass binary checks)
  "zmodload",
  // emulate with -c flag is an eval-equivalent that executes arbitrary code
  "emulate",
  // Zsh module builtins that enable dangerous operations.
  // These require zmodload first, but we block them as defense-in-depth
  // in case zmodload is somehow bypassed or the module is pre-loaded.
  "sysopen",
  // Opens files with fine-grained control (zsh/system)
  "sysread",
  // Reads from file descriptors (zsh/system)
  "syswrite",
  // Writes to file descriptors (zsh/system)
  "sysseek",
  // Seeks on file descriptors (zsh/system)
  "zpty",
  // Executes commands on pseudo-terminals (zsh/zpty)
  "ztcp",
  // Creates TCP connections for exfiltration (zsh/net/tcp)
  "zsocket",
  // Creates Unix/TCP sockets (zsh/net/socket)
  "mapfile",
  // Not actually a command, but the associative array is set via zmodload
  "zf_rm",
  // Builtin rm from zsh/files
  "zf_mv",
  // Builtin mv from zsh/files
  "zf_ln",
  // Builtin ln from zsh/files
  "zf_chmod",
  // Builtin chmod from zsh/files
  "zf_chown",
  // Builtin chown from zsh/files
  "zf_mkdir",
  // Builtin mkdir from zsh/files
  "zf_rmdir",
  // Builtin rmdir from zsh/files
  "zf_chgrp"
  // Builtin chgrp from zsh/files
]);
const BASH_SECURITY_CHECK_IDS = {
  INCOMPLETE_COMMANDS: 1,
  JQ_SYSTEM_FUNCTION: 2,
  JQ_FILE_ARGUMENTS: 3,
  OBFUSCATED_FLAGS: 4,
  SHELL_METACHARACTERS: 5,
  DANGEROUS_VARIABLES: 6,
  NEWLINES: 7,
  DANGEROUS_PATTERNS_COMMAND_SUBSTITUTION: 8,
  DANGEROUS_PATTERNS_INPUT_REDIRECTION: 9,
  DANGEROUS_PATTERNS_OUTPUT_REDIRECTION: 10,
  IFS_INJECTION: 11,
  GIT_COMMIT_SUBSTITUTION: 12,
  PROC_ENVIRON_ACCESS: 13,
  MALFORMED_TOKEN_INJECTION: 14,
  BACKSLASH_ESCAPED_WHITESPACE: 15,
  BRACE_EXPANSION: 16,
  CONTROL_CHARACTERS: 17,
  UNICODE_WHITESPACE: 18,
  MID_WORD_HASH: 19,
  ZSH_DANGEROUS_COMMANDS: 20,
  BACKSLASH_ESCAPED_OPERATORS: 21,
  COMMENT_QUOTE_DESYNC: 22,
  QUOTED_NEWLINE: 23
};
function extractQuotedContent(command, isJq = false) {
  let withDoubleQuotes = "";
  let fullyUnquoted = "";
  let unquotedKeepQuoteChars = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (escaped) {
      escaped = false;
      if (!inSingleQuote) withDoubleQuotes += char;
      if (!inSingleQuote && !inDoubleQuote) fullyUnquoted += char;
      if (!inSingleQuote && !inDoubleQuote) unquotedKeepQuoteChars += char;
      continue;
    }
    if (char === "\\" && !inSingleQuote) {
      escaped = true;
      if (!inSingleQuote) withDoubleQuotes += char;
      if (!inSingleQuote && !inDoubleQuote) fullyUnquoted += char;
      if (!inSingleQuote && !inDoubleQuote) unquotedKeepQuoteChars += char;
      continue;
    }
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      unquotedKeepQuoteChars += char;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      unquotedKeepQuoteChars += char;
      if (!isJq) continue;
    }
    if (!inSingleQuote) withDoubleQuotes += char;
    if (!inSingleQuote && !inDoubleQuote) fullyUnquoted += char;
    if (!inSingleQuote && !inDoubleQuote) unquotedKeepQuoteChars += char;
  }
  return { withDoubleQuotes, fullyUnquoted, unquotedKeepQuoteChars };
}
function stripSafeRedirections(content) {
  return content.replace(/\s+2\s*>&\s*1(?=\s|$)/g, "").replace(/[012]?\s*>\s*\/dev\/null(?=\s|$)/g, "").replace(/\s*<\s*\/dev\/null(?=\s|$)/g, "");
}
function hasUnescapedChar(content, char) {
  if (char.length !== 1) {
    throw new Error("hasUnescapedChar only works with single characters");
  }
  let i = 0;
  while (i < content.length) {
    if (content[i] === "\\" && i + 1 < content.length) {
      i += 2;
      continue;
    }
    if (content[i] === char) {
      return true;
    }
    i++;
  }
  return false;
}
function validateEmpty(context) {
  if (!context.originalCommand.trim()) {
    return {
      behavior: "allow",
      updatedInput: { command: context.originalCommand },
      decisionReason: { type: "other", reason: "Empty command is safe" }
    };
  }
  return { behavior: "passthrough", message: "Command is not empty" };
}
function validateIncompleteCommands(context) {
  const { originalCommand } = context;
  const trimmed = originalCommand.trim();
  if (/^\s*\t/.test(originalCommand)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.INCOMPLETE_COMMANDS,
      subId: 1
    });
    return {
      behavior: "ask",
      message: "Command appears to be an incomplete fragment (starts with tab)"
    };
  }
  if (trimmed.startsWith("-")) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.INCOMPLETE_COMMANDS,
      subId: 2
    });
    return {
      behavior: "ask",
      message: "Command appears to be an incomplete fragment (starts with flags)"
    };
  }
  if (/^\s*(&&|\|\||;|>>?|<)/.test(originalCommand)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.INCOMPLETE_COMMANDS,
      subId: 3
    });
    return {
      behavior: "ask",
      message: "Command appears to be a continuation line (starts with operator)"
    };
  }
  return { behavior: "passthrough", message: "Command appears complete" };
}
function isSafeHeredoc(command) {
  if (!HEREDOC_IN_SUBSTITUTION.test(command)) return false;
  const heredocPattern = /\$\(cat[ \t]*<<(-?)[ \t]*(?:'+([A-Za-z_]\w*)'+|\\([A-Za-z_]\w*))/g;
  let match;
  const safeHeredocs = [];
  while ((match = heredocPattern.exec(command)) !== null) {
    const delimiter = match[2] || match[3];
    if (delimiter) {
      safeHeredocs.push({
        start: match.index,
        operatorEnd: match.index + match[0].length,
        delimiter,
        isDash: match[1] === "-"
      });
    }
  }
  if (safeHeredocs.length === 0) return false;
  const verified = [];
  for (const { start, operatorEnd, delimiter, isDash } of safeHeredocs) {
    const afterOperator = command.slice(operatorEnd);
    const openLineEnd = afterOperator.indexOf("\n");
    if (openLineEnd === -1) return false;
    const openLineTail = afterOperator.slice(0, openLineEnd);
    if (!/^[ \t]*$/.test(openLineTail)) return false;
    const bodyStart = operatorEnd + openLineEnd + 1;
    const body = command.slice(bodyStart);
    const bodyLines = body.split("\n");
    let closingLineIdx = -1;
    let closeParenLineIdx = -1;
    let closeParenColIdx = -1;
    for (let i = 0; i < bodyLines.length; i++) {
      const rawLine = bodyLines[i];
      const line = isDash ? rawLine.replace(/^\t*/, "") : rawLine;
      if (line === delimiter) {
        closingLineIdx = i;
        const nextLine = bodyLines[i + 1];
        if (nextLine === void 0) return false;
        const parenMatch = nextLine.match(/^([ \t]*)\)/);
        if (!parenMatch) return false;
        closeParenLineIdx = i + 1;
        closeParenColIdx = parenMatch[1].length;
        break;
      }
      if (line.startsWith(delimiter)) {
        const afterDelim = line.slice(delimiter.length);
        const parenMatch = afterDelim.match(/^([ \t]*)\)/);
        if (parenMatch) {
          closingLineIdx = i;
          closeParenLineIdx = i;
          const tabPrefix = isDash ? rawLine.match(/^\t*/)?.[0] ?? "" : "";
          closeParenColIdx = tabPrefix.length + delimiter.length + parenMatch[1].length;
          break;
        }
        if (/^[)}`|&;(<>]/.test(afterDelim)) {
          return false;
        }
      }
    }
    if (closingLineIdx === -1) return false;
    let endPos = bodyStart;
    for (let i = 0; i < closeParenLineIdx; i++) {
      endPos += bodyLines[i].length + 1;
    }
    endPos += closeParenColIdx + 1;
    verified.push({ start, end: endPos });
  }
  for (const outer of verified) {
    for (const inner of verified) {
      if (inner === outer) continue;
      if (inner.start > outer.start && inner.start < outer.end) {
        return false;
      }
    }
  }
  const sortedVerified = [...verified].sort((a, b) => b.start - a.start);
  let remaining = command;
  for (const { start, end } of sortedVerified) {
    remaining = remaining.slice(0, start) + remaining.slice(end);
  }
  const trimmedRemaining = remaining.trim();
  if (trimmedRemaining.length > 0) {
    const firstHeredocStart = Math.min(...verified.map((v) => v.start));
    const prefix = command.slice(0, firstHeredocStart);
    if (prefix.trim().length === 0) {
      return false;
    }
  }
  if (!/^[a-zA-Z0-9 \t"'.\-/_@=,:+~]*$/.test(remaining)) return false;
  if (bashCommandIsSafe_DEPRECATED(remaining).behavior !== "passthrough")
    return false;
  return true;
}
function stripSafeHeredocSubstitutions(command) {
  if (!HEREDOC_IN_SUBSTITUTION.test(command)) return null;
  const heredocPattern = /\$\(cat[ \t]*<<(-?)[ \t]*(?:'+([A-Za-z_]\w*)'+|\\([A-Za-z_]\w*))/g;
  let result = command;
  let found = false;
  let match;
  const ranges = [];
  while ((match = heredocPattern.exec(command)) !== null) {
    if (match.index > 0 && command[match.index - 1] === "\\") continue;
    const delimiter = match[2] || match[3];
    if (!delimiter) continue;
    const isDash = match[1] === "-";
    const operatorEnd = match.index + match[0].length;
    const afterOperator = command.slice(operatorEnd);
    const openLineEnd = afterOperator.indexOf("\n");
    if (openLineEnd === -1) continue;
    if (!/^[ \t]*$/.test(afterOperator.slice(0, openLineEnd))) continue;
    const bodyStart = operatorEnd + openLineEnd + 1;
    const bodyLines = command.slice(bodyStart).split("\n");
    for (let i = 0; i < bodyLines.length; i++) {
      const rawLine = bodyLines[i];
      const line = isDash ? rawLine.replace(/^\t*/, "") : rawLine;
      if (line.startsWith(delimiter)) {
        const after = line.slice(delimiter.length);
        let closePos = -1;
        if (/^[ \t]*\)/.test(after)) {
          const lineStart = bodyStart + bodyLines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
          closePos = command.indexOf(")", lineStart);
        } else if (after === "") {
          const nextLine = bodyLines[i + 1];
          if (nextLine !== void 0 && /^[ \t]*\)/.test(nextLine)) {
            const nextLineStart = bodyStart + bodyLines.slice(0, i + 1).join("\n").length + 1;
            closePos = command.indexOf(")", nextLineStart);
          }
        }
        if (closePos !== -1) {
          ranges.push({ start: match.index, end: closePos + 1 });
          found = true;
        }
        break;
      }
    }
  }
  if (!found) return null;
  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i];
    result = result.slice(0, r.start) + result.slice(r.end);
  }
  return result;
}
function hasSafeHeredocSubstitution(command) {
  return stripSafeHeredocSubstitutions(command) !== null;
}
function validateSafeCommandSubstitution(context) {
  const { originalCommand } = context;
  if (!HEREDOC_IN_SUBSTITUTION.test(originalCommand)) {
    return { behavior: "passthrough", message: "No heredoc in substitution" };
  }
  if (isSafeHeredoc(originalCommand)) {
    return {
      behavior: "allow",
      updatedInput: { command: originalCommand },
      decisionReason: {
        type: "other",
        reason: "Safe command substitution: cat with quoted/escaped heredoc delimiter"
      }
    };
  }
  return {
    behavior: "passthrough",
    message: "Command substitution needs validation"
  };
}
function validateGitCommit(context) {
  const { originalCommand, baseCommand } = context;
  if (baseCommand !== "git" || !/^git\s+commit\s+/.test(originalCommand)) {
    return { behavior: "passthrough", message: "Not a git commit" };
  }
  if (originalCommand.includes("\\")) {
    return {
      behavior: "passthrough",
      message: "Git commit contains backslash, needs full validation"
    };
  }
  const messageMatch = originalCommand.match(
    /^git[ \t]+commit[ \t]+[^;&|`$<>()\n\r]*?-m[ \t]+(["'])([\s\S]*?)\1(.*)$/
  );
  if (messageMatch) {
    const [, quote, messageContent, remainder] = messageMatch;
    if (quote === '"' && messageContent && /\$\(|`|\$\{/.test(messageContent)) {
      logEvent("tengu_bash_security_check_triggered", {
        checkId: BASH_SECURITY_CHECK_IDS.GIT_COMMIT_SUBSTITUTION,
        subId: 1
      });
      return {
        behavior: "ask",
        message: "Git commit message contains command substitution patterns"
      };
    }
    if (remainder && /[;|&()`]|\$\(|\$\{/.test(remainder)) {
      return {
        behavior: "passthrough",
        message: "Git commit remainder contains shell metacharacters"
      };
    }
    if (remainder) {
      let unquoted = "";
      let inSQ = false;
      let inDQ = false;
      for (let i = 0; i < remainder.length; i++) {
        const c = remainder[i];
        if (c === "'" && !inDQ) {
          inSQ = !inSQ;
          continue;
        }
        if (c === '"' && !inSQ) {
          inDQ = !inDQ;
          continue;
        }
        if (!inSQ && !inDQ) unquoted += c;
      }
      if (/[<>]/.test(unquoted)) {
        return {
          behavior: "passthrough",
          message: "Git commit remainder contains unquoted redirect operator"
        };
      }
    }
    if (messageContent && messageContent.startsWith("-")) {
      logEvent("tengu_bash_security_check_triggered", {
        checkId: BASH_SECURITY_CHECK_IDS.OBFUSCATED_FLAGS,
        subId: 5
      });
      return {
        behavior: "ask",
        message: "Command contains quoted characters in flag names"
      };
    }
    return {
      behavior: "allow",
      updatedInput: { command: originalCommand },
      decisionReason: {
        type: "other",
        reason: "Git commit with simple quoted message is allowed"
      }
    };
  }
  return { behavior: "passthrough", message: "Git commit needs validation" };
}
function validateJqCommand(context) {
  const { originalCommand, baseCommand } = context;
  if (baseCommand !== "jq") {
    return { behavior: "passthrough", message: "Not jq" };
  }
  if (/\bsystem\s*\(/.test(originalCommand)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.JQ_SYSTEM_FUNCTION,
      subId: 1
    });
    return {
      behavior: "ask",
      message: "jq command contains system() function which executes arbitrary commands"
    };
  }
  const afterJq = originalCommand.substring(3).trim();
  if (/(?:^|\s)(?:-f\b|--from-file|--rawfile|--slurpfile|-L\b|--library-path)/.test(
    afterJq
  )) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.JQ_FILE_ARGUMENTS,
      subId: 1
    });
    return {
      behavior: "ask",
      message: "jq command contains dangerous flags that could execute code or read arbitrary files"
    };
  }
  return { behavior: "passthrough", message: "jq command is safe" };
}
function validateShellMetacharacters(context) {
  const { unquotedContent } = context;
  const message = "Command contains shell metacharacters (;, |, or &) in arguments";
  if (/(?:^|\s)["'][^"']*[;&][^"']*["'](?:\s|$)/.test(unquotedContent)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.SHELL_METACHARACTERS,
      subId: 1
    });
    return { behavior: "ask", message };
  }
  const globPatterns = [
    /-name\s+["'][^"']*[;|&][^"']*["']/,
    /-path\s+["'][^"']*[;|&][^"']*["']/,
    /-iname\s+["'][^"']*[;|&][^"']*["']/
  ];
  if (globPatterns.some((p) => p.test(unquotedContent))) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.SHELL_METACHARACTERS,
      subId: 2
    });
    return { behavior: "ask", message };
  }
  if (/-regex\s+["'][^"']*[;&][^"']*["']/.test(unquotedContent)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.SHELL_METACHARACTERS,
      subId: 3
    });
    return { behavior: "ask", message };
  }
  return { behavior: "passthrough", message: "No metacharacters" };
}
function validateDangerousVariables(context) {
  const { fullyUnquotedContent } = context;
  if (/[<>|]\s*\$[A-Za-z_]/.test(fullyUnquotedContent) || /\$[A-Za-z_][A-Za-z0-9_]*\s*[|<>]/.test(fullyUnquotedContent)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.DANGEROUS_VARIABLES,
      subId: 1
    });
    return {
      behavior: "ask",
      message: "Command contains variables in dangerous contexts (redirections or pipes)"
    };
  }
  return { behavior: "passthrough", message: "No dangerous variables" };
}
function validateDangerousPatterns(context) {
  const { unquotedContent } = context;
  if (hasUnescapedChar(unquotedContent, "`")) {
    return {
      behavior: "ask",
      message: "Command contains backticks (`) for command substitution"
    };
  }
  for (const { pattern, message } of COMMAND_SUBSTITUTION_PATTERNS) {
    if (pattern.test(unquotedContent)) {
      logEvent("tengu_bash_security_check_triggered", {
        checkId: BASH_SECURITY_CHECK_IDS.DANGEROUS_PATTERNS_COMMAND_SUBSTITUTION,
        subId: 1
      });
      return { behavior: "ask", message: `Command contains ${message}` };
    }
  }
  return { behavior: "passthrough", message: "No dangerous patterns" };
}
function validateRedirections(context) {
  const { fullyUnquotedContent } = context;
  if (/</.test(fullyUnquotedContent)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.DANGEROUS_PATTERNS_INPUT_REDIRECTION,
      subId: 1
    });
    return {
      behavior: "ask",
      message: "Command contains input redirection (<) which could read sensitive files"
    };
  }
  if (/>/.test(fullyUnquotedContent)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.DANGEROUS_PATTERNS_OUTPUT_REDIRECTION,
      subId: 1
    });
    return {
      behavior: "ask",
      message: "Command contains output redirection (>) which could write to arbitrary files"
    };
  }
  return { behavior: "passthrough", message: "No redirections" };
}
function validateNewlines(context) {
  const { fullyUnquotedPreStrip } = context;
  if (!/[\n\r]/.test(fullyUnquotedPreStrip)) {
    return { behavior: "passthrough", message: "No newlines" };
  }
  const looksLikeCommand = /(?<![\s]\\)[\n\r]\s*\S/.test(fullyUnquotedPreStrip);
  if (looksLikeCommand) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.NEWLINES,
      subId: 1
    });
    return {
      behavior: "ask",
      message: "Command contains newlines that could separate multiple commands"
    };
  }
  return {
    behavior: "passthrough",
    message: "Newlines appear to be within data"
  };
}
function validateCarriageReturn(context) {
  const { originalCommand } = context;
  if (!originalCommand.includes("\r")) {
    return { behavior: "passthrough", message: "No carriage return" };
  }
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;
  for (let i = 0; i < originalCommand.length; i++) {
    const c = originalCommand[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === "\\" && !inSingleQuote) {
      escaped = true;
      continue;
    }
    if (c === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (c === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (c === "\r" && !inDoubleQuote) {
      logEvent("tengu_bash_security_check_triggered", {
        checkId: BASH_SECURITY_CHECK_IDS.NEWLINES,
        subId: 2
      });
      return {
        behavior: "ask",
        message: "Command contains carriage return (\\r) which shell-quote and bash tokenize differently"
      };
    }
  }
  return { behavior: "passthrough", message: "CR only inside double quotes" };
}
function validateIFSInjection(context) {
  const { originalCommand } = context;
  if (/\$IFS|\$\{[^}]*IFS/.test(originalCommand)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.IFS_INJECTION,
      subId: 1
    });
    return {
      behavior: "ask",
      message: "Command contains IFS variable usage which could bypass security validation"
    };
  }
  return { behavior: "passthrough", message: "No IFS injection detected" };
}
function validateProcEnvironAccess(context) {
  const { originalCommand } = context;
  if (/\/proc\/.*\/environ/.test(originalCommand)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.PROC_ENVIRON_ACCESS,
      subId: 1
    });
    return {
      behavior: "ask",
      message: "Command accesses /proc/*/environ which could expose sensitive environment variables"
    };
  }
  return {
    behavior: "passthrough",
    message: "No /proc/environ access detected"
  };
}
function validateMalformedTokenInjection(context) {
  const { originalCommand } = context;
  const parseResult = tryParseShellCommand(originalCommand);
  if (!parseResult.success) {
    return {
      behavior: "passthrough",
      message: "Parse failed, handled elsewhere"
    };
  }
  const parsed = parseResult.tokens;
  const hasCommandSeparator = parsed.some(
    (entry) => typeof entry === "object" && entry !== null && "op" in entry && (entry.op === ";" || entry.op === "&&" || entry.op === "||")
  );
  if (!hasCommandSeparator) {
    return { behavior: "passthrough", message: "No command separators" };
  }
  if (hasMalformedTokens(originalCommand, parsed)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.MALFORMED_TOKEN_INJECTION,
      subId: 1
    });
    return {
      behavior: "ask",
      message: "Command contains ambiguous syntax with command separators that could be misinterpreted"
    };
  }
  return {
    behavior: "passthrough",
    message: "No malformed token injection detected"
  };
}
function validateObfuscatedFlags(context) {
  const { originalCommand, baseCommand } = context;
  const hasShellOperators = /[|&;]/.test(originalCommand);
  if (baseCommand === "echo" && !hasShellOperators) {
    return {
      behavior: "passthrough",
      message: "echo command is safe and has no dangerous flags"
    };
  }
  if (/\$'[^']*'/.test(originalCommand)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.OBFUSCATED_FLAGS,
      subId: 5
    });
    return {
      behavior: "ask",
      message: "Command contains ANSI-C quoting which can hide characters"
    };
  }
  if (/\$"[^"]*"/.test(originalCommand)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.OBFUSCATED_FLAGS,
      subId: 6
    });
    return {
      behavior: "ask",
      message: "Command contains locale quoting which can hide characters"
    };
  }
  if (/\$['"]{2}\s*-/.test(originalCommand)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.OBFUSCATED_FLAGS,
      subId: 9
    });
    return {
      behavior: "ask",
      message: "Command contains empty special quotes before dash (potential bypass)"
    };
  }
  if (/(?:^|\s)(?:''|"")+\s*-/.test(originalCommand)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.OBFUSCATED_FLAGS,
      subId: 7
    });
    return {
      behavior: "ask",
      message: "Command contains empty quotes before dash (potential bypass)"
    };
  }
  if (/(?:""|'')+['"]-/.test(originalCommand)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.OBFUSCATED_FLAGS,
      subId: 10
    });
    return {
      behavior: "ask",
      message: "Command contains empty quote pair adjacent to quoted dash (potential flag obfuscation)"
    };
  }
  if (/(?:^|\s)['"]{3,}/.test(originalCommand)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.OBFUSCATED_FLAGS,
      subId: 11
    });
    return {
      behavior: "ask",
      message: "Command contains consecutive quote characters at word start (potential obfuscation)"
    };
  }
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;
  for (let i = 0; i < originalCommand.length - 1; i++) {
    const currentChar = originalCommand[i];
    const nextChar = originalCommand[i + 1];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (currentChar === "\\" && !inSingleQuote) {
      escaped = true;
      continue;
    }
    if (currentChar === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (currentChar === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (inSingleQuote || inDoubleQuote) {
      continue;
    }
    if (currentChar && nextChar && /\s/.test(currentChar) && /['"`]/.test(nextChar)) {
      const quoteChar = nextChar;
      let j = i + 2;
      let insideQuote = "";
      while (j < originalCommand.length && originalCommand[j] !== quoteChar) {
        insideQuote += originalCommand[j];
        j++;
      }
      const charAfterQuote = originalCommand[j + 1];
      const hasFlagCharsInside = /^-+[a-zA-Z0-9$`]/.test(insideQuote);
      const FLAG_CONTINUATION_CHARS = /[a-zA-Z0-9\\${`-]/;
      const hasFlagCharsContinuing = /^-+$/.test(insideQuote) && charAfterQuote !== void 0 && FLAG_CONTINUATION_CHARS.test(charAfterQuote);
      const hasFlagCharsInNextQuote = (
        // Trigger when: first segment is only dashes OR empty (could be prefix for flag)
        (insideQuote === "" || /^-+$/.test(insideQuote)) && charAfterQuote !== void 0 && /['"`]/.test(charAfterQuote) && (() => {
          let pos = j + 1;
          let combinedContent = insideQuote;
          while (pos < originalCommand.length && /['"`]/.test(originalCommand[pos])) {
            const segQuote = originalCommand[pos];
            let end = pos + 1;
            while (end < originalCommand.length && originalCommand[end] !== segQuote) {
              end++;
            }
            const segment = originalCommand.slice(pos + 1, end);
            combinedContent += segment;
            if (/^-+[a-zA-Z0-9$`]/.test(combinedContent)) return true;
            const priorContent = segment.length > 0 ? combinedContent.slice(0, -segment.length) : combinedContent;
            if (/^-+$/.test(priorContent)) {
              if (/[a-zA-Z0-9$`]/.test(segment)) return true;
            }
            if (end >= originalCommand.length) break;
            pos = end + 1;
          }
          if (pos < originalCommand.length && FLAG_CONTINUATION_CHARS.test(originalCommand[pos])) {
            if (/^-+$/.test(combinedContent) || combinedContent === "") {
              const nextChar2 = originalCommand[pos];
              if (nextChar2 === "-") {
                return true;
              }
              if (/[a-zA-Z0-9\\${`]/.test(nextChar2) && combinedContent !== "") {
                return true;
              }
            }
            if (/^-/.test(combinedContent)) {
              return true;
            }
          }
          return false;
        })()
      );
      if (j < originalCommand.length && originalCommand[j] === quoteChar && (hasFlagCharsInside || hasFlagCharsContinuing || hasFlagCharsInNextQuote)) {
        logEvent("tengu_bash_security_check_triggered", {
          checkId: BASH_SECURITY_CHECK_IDS.OBFUSCATED_FLAGS,
          subId: 4
        });
        return {
          behavior: "ask",
          message: "Command contains quoted characters in flag names"
        };
      }
    }
    if (currentChar && nextChar && /\s/.test(currentChar) && nextChar === "-") {
      let j = i + 1;
      let flagContent = "";
      while (j < originalCommand.length) {
        const flagChar = originalCommand[j];
        if (!flagChar) break;
        if (/[\s=]/.test(flagChar)) {
          break;
        }
        if (/['"`]/.test(flagChar)) {
          if (baseCommand === "cut" && flagContent === "-d" && /['"`]/.test(flagChar)) {
            break;
          }
          if (j + 1 < originalCommand.length) {
            const nextFlagChar = originalCommand[j + 1];
            if (nextFlagChar && !/[a-zA-Z0-9_'"-]/.test(nextFlagChar)) {
              break;
            }
          }
        }
        flagContent += flagChar;
        j++;
      }
      if (flagContent.includes('"') || flagContent.includes("'")) {
        logEvent("tengu_bash_security_check_triggered", {
          checkId: BASH_SECURITY_CHECK_IDS.OBFUSCATED_FLAGS,
          subId: 1
        });
        return {
          behavior: "ask",
          message: "Command contains quoted characters in flag names"
        };
      }
    }
  }
  if (/\s['"`]-/.test(context.fullyUnquotedContent)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.OBFUSCATED_FLAGS,
      subId: 2
    });
    return {
      behavior: "ask",
      message: "Command contains quoted characters in flag names"
    };
  }
  if (/['"`]{2}-/.test(context.fullyUnquotedContent)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.OBFUSCATED_FLAGS,
      subId: 3
    });
    return {
      behavior: "ask",
      message: "Command contains quoted characters in flag names"
    };
  }
  return { behavior: "passthrough", message: "No obfuscated flags detected" };
}
function hasBackslashEscapedWhitespace(command) {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (char === "\\" && !inSingleQuote) {
      if (!inDoubleQuote) {
        const nextChar = command[i + 1];
        if (nextChar === " " || nextChar === "	") {
          return true;
        }
      }
      i++;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
  }
  return false;
}
function validateBackslashEscapedWhitespace(context) {
  if (hasBackslashEscapedWhitespace(context.originalCommand)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.BACKSLASH_ESCAPED_WHITESPACE
    });
    return {
      behavior: "ask",
      message: "Command contains backslash-escaped whitespace that could alter command parsing"
    };
  }
  return {
    behavior: "passthrough",
    message: "No backslash-escaped whitespace"
  };
}
const SHELL_OPERATORS = /* @__PURE__ */ new Set([";", "|", "&", "<", ">"]);
function hasBackslashEscapedOperator(command) {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (char === "\\" && !inSingleQuote) {
      if (!inDoubleQuote) {
        const nextChar = command[i + 1];
        if (nextChar && SHELL_OPERATORS.has(nextChar)) {
          return true;
        }
      }
      i++;
      continue;
    }
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
  }
  return false;
}
function validateBackslashEscapedOperators(context) {
  if (context.treeSitter && !context.treeSitter.hasActualOperatorNodes) {
    return { behavior: "passthrough", message: "No operator nodes in AST" };
  }
  if (hasBackslashEscapedOperator(context.originalCommand)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.BACKSLASH_ESCAPED_OPERATORS
    });
    return {
      behavior: "ask",
      message: "Command contains a backslash before a shell operator (;, |, &, <, >) which can hide command structure"
    };
  }
  return {
    behavior: "passthrough",
    message: "No backslash-escaped operators"
  };
}
function isEscapedAtPosition(content, pos) {
  let backslashCount = 0;
  let i = pos - 1;
  while (i >= 0 && content[i] === "\\") {
    backslashCount++;
    i--;
  }
  return backslashCount % 2 === 1;
}
function validateBraceExpansion(context) {
  const content = context.fullyUnquotedPreStrip;
  let unescapedOpenBraces = 0;
  let unescapedCloseBraces = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "{" && !isEscapedAtPosition(content, i)) {
      unescapedOpenBraces++;
    } else if (content[i] === "}" && !isEscapedAtPosition(content, i)) {
      unescapedCloseBraces++;
    }
  }
  if (unescapedOpenBraces > 0 && unescapedCloseBraces > unescapedOpenBraces) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.BRACE_EXPANSION,
      subId: 2
    });
    return {
      behavior: "ask",
      message: "Command has excess closing braces after quote stripping, indicating possible brace expansion obfuscation"
    };
  }
  if (unescapedOpenBraces > 0) {
    const orig = context.originalCommand;
    if (/['"][{}]['"]/.test(orig)) {
      logEvent("tengu_bash_security_check_triggered", {
        checkId: BASH_SECURITY_CHECK_IDS.BRACE_EXPANSION,
        subId: 3
      });
      return {
        behavior: "ask",
        message: "Command contains quoted brace character inside brace context (potential brace expansion obfuscation)"
      };
    }
  }
  for (let i = 0; i < content.length; i++) {
    if (content[i] !== "{") continue;
    if (isEscapedAtPosition(content, i)) continue;
    let depth = 1;
    let matchingClose = -1;
    for (let j = i + 1; j < content.length; j++) {
      const ch = content[j];
      if (ch === "{" && !isEscapedAtPosition(content, j)) {
        depth++;
      } else if (ch === "}" && !isEscapedAtPosition(content, j)) {
        depth--;
        if (depth === 0) {
          matchingClose = j;
          break;
        }
      }
    }
    if (matchingClose === -1) continue;
    let innerDepth = 0;
    for (let k = i + 1; k < matchingClose; k++) {
      const ch = content[k];
      if (ch === "{" && !isEscapedAtPosition(content, k)) {
        innerDepth++;
      } else if (ch === "}" && !isEscapedAtPosition(content, k)) {
        innerDepth--;
      } else if (innerDepth === 0) {
        if (ch === "," || ch === "." && k + 1 < matchingClose && content[k + 1] === ".") {
          logEvent("tengu_bash_security_check_triggered", {
            checkId: BASH_SECURITY_CHECK_IDS.BRACE_EXPANSION,
            subId: 1
          });
          return {
            behavior: "ask",
            message: "Command contains brace expansion that could alter command parsing"
          };
        }
      }
    }
  }
  return {
    behavior: "passthrough",
    message: "No brace expansion detected"
  };
}
const UNICODE_WS_RE = /[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]/;
function validateUnicodeWhitespace(context) {
  const { originalCommand } = context;
  if (UNICODE_WS_RE.test(originalCommand)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.UNICODE_WHITESPACE
    });
    return {
      behavior: "ask",
      message: "Command contains Unicode whitespace characters that could cause parsing inconsistencies"
    };
  }
  return { behavior: "passthrough", message: "No Unicode whitespace" };
}
function validateMidWordHash(context) {
  const { unquotedKeepQuoteChars } = context;
  const joined = unquotedKeepQuoteChars.replace(/\\+\n/g, (match) => {
    const backslashCount = match.length - 1;
    return backslashCount % 2 === 1 ? "\\".repeat(backslashCount - 1) : match;
  });
  if (
    // eslint-disable-next-line custom-rules/no-lookbehind-regex -- .test() with atom search: fast when # absent
    /\S(?<!\$\{)#/.test(unquotedKeepQuoteChars) || // eslint-disable-next-line custom-rules/no-lookbehind-regex -- same as above
    /\S(?<!\$\{)#/.test(joined)
  ) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.MID_WORD_HASH
    });
    return {
      behavior: "ask",
      message: "Command contains mid-word # which is parsed differently by shell-quote vs bash"
    };
  }
  return { behavior: "passthrough", message: "No mid-word hash" };
}
function validateCommentQuoteDesync(context) {
  if (context.treeSitter) {
    return {
      behavior: "passthrough",
      message: "Tree-sitter quote context is authoritative"
    };
  }
  const { originalCommand } = context;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;
  for (let i = 0; i < originalCommand.length; i++) {
    const char = originalCommand[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inSingleQuote) {
      if (char === "'") inSingleQuote = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (inDoubleQuote) {
      if (char === '"') inDoubleQuote = false;
      continue;
    }
    if (char === "'") {
      inSingleQuote = true;
      continue;
    }
    if (char === '"') {
      inDoubleQuote = true;
      continue;
    }
    if (char === "#") {
      const lineEnd = originalCommand.indexOf("\n", i);
      const commentText = originalCommand.slice(
        i + 1,
        lineEnd === -1 ? originalCommand.length : lineEnd
      );
      if (/['"]/.test(commentText)) {
        logEvent("tengu_bash_security_check_triggered", {
          checkId: BASH_SECURITY_CHECK_IDS.COMMENT_QUOTE_DESYNC
        });
        return {
          behavior: "ask",
          message: "Command contains quote characters inside a # comment which can desync quote tracking"
        };
      }
      if (lineEnd === -1) break;
      i = lineEnd;
    }
  }
  return { behavior: "passthrough", message: "No comment quote desync" };
}
function validateQuotedNewline(context) {
  const { originalCommand } = context;
  if (!originalCommand.includes("\n") || !originalCommand.includes("#")) {
    return { behavior: "passthrough", message: "No newline or no hash" };
  }
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;
  for (let i = 0; i < originalCommand.length; i++) {
    const char = originalCommand[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && !inSingleQuote) {
      escaped = true;
      continue;
    }
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (char === "\n" && (inSingleQuote || inDoubleQuote)) {
      const lineStart = i + 1;
      const nextNewline = originalCommand.indexOf("\n", lineStart);
      const lineEnd = nextNewline === -1 ? originalCommand.length : nextNewline;
      const nextLine = originalCommand.slice(lineStart, lineEnd);
      if (nextLine.trim().startsWith("#")) {
        logEvent("tengu_bash_security_check_triggered", {
          checkId: BASH_SECURITY_CHECK_IDS.QUOTED_NEWLINE
        });
        return {
          behavior: "ask",
          message: "Command contains a quoted newline followed by a #-prefixed line, which can hide arguments from line-based permission checks"
        };
      }
    }
  }
  return { behavior: "passthrough", message: "No quoted newline-hash pattern" };
}
function validateZshDangerousCommands(context) {
  const { originalCommand } = context;
  const ZSH_PRECOMMAND_MODIFIERS = /* @__PURE__ */ new Set([
    "command",
    "builtin",
    "noglob",
    "nocorrect"
  ]);
  const trimmed = originalCommand.trim();
  const tokens = trimmed.split(/\s+/);
  let baseCmd = "";
  for (const token of tokens) {
    if (/^[A-Za-z_]\w*=/.test(token)) continue;
    if (ZSH_PRECOMMAND_MODIFIERS.has(token)) continue;
    baseCmd = token;
    break;
  }
  if (ZSH_DANGEROUS_COMMANDS.has(baseCmd)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.ZSH_DANGEROUS_COMMANDS,
      subId: 1
    });
    return {
      behavior: "ask",
      message: `Command uses Zsh-specific '${baseCmd}' which can bypass security checks`
    };
  }
  if (baseCmd === "fc" && /\s-\S*e/.test(trimmed)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.ZSH_DANGEROUS_COMMANDS,
      subId: 2
    });
    return {
      behavior: "ask",
      message: "Command uses 'fc -e' which can execute arbitrary commands via editor"
    };
  }
  return {
    behavior: "passthrough",
    message: "No Zsh dangerous commands"
  };
}
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
function bashCommandIsSafe_DEPRECATED(command) {
  if (CONTROL_CHAR_RE.test(command)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.CONTROL_CHARACTERS
    });
    return {
      behavior: "ask",
      message: "Command contains non-printable control characters that could be used to bypass security checks",
      isBashSecurityCheckForMisparsing: true
    };
  }
  if (hasShellQuoteSingleQuoteBug(command)) {
    return {
      behavior: "ask",
      message: "Command contains single-quoted backslash pattern that could bypass security checks",
      isBashSecurityCheckForMisparsing: true
    };
  }
  const { processedCommand } = extractHeredocs(command, { quotedOnly: true });
  const baseCommand = command.split(" ")[0] || "";
  const { withDoubleQuotes, fullyUnquoted, unquotedKeepQuoteChars } = extractQuotedContent(processedCommand, baseCommand === "jq");
  const context = {
    originalCommand: command,
    baseCommand,
    unquotedContent: withDoubleQuotes,
    fullyUnquotedContent: stripSafeRedirections(fullyUnquoted),
    fullyUnquotedPreStrip: fullyUnquoted,
    unquotedKeepQuoteChars
  };
  const earlyValidators = [
    validateEmpty,
    validateIncompleteCommands,
    validateSafeCommandSubstitution,
    validateGitCommit
  ];
  for (const validator of earlyValidators) {
    const result = validator(context);
    if (result.behavior === "allow") {
      return {
        behavior: "passthrough",
        message: result.decisionReason?.type === "other" || result.decisionReason?.type === "safetyCheck" ? result.decisionReason.reason : "Command allowed"
      };
    }
    if (result.behavior !== "passthrough") {
      return result.behavior === "ask" ? { ...result, isBashSecurityCheckForMisparsing: true } : result;
    }
  }
  const nonMisparsingValidators = /* @__PURE__ */ new Set([
    validateNewlines,
    validateRedirections
  ]);
  const validators = [
    validateJqCommand,
    validateObfuscatedFlags,
    validateShellMetacharacters,
    validateDangerousVariables,
    // Run comment-quote-desync BEFORE validateNewlines: it detects cases where
    // the quote tracker would miss newlines due to # comment desync.
    validateCommentQuoteDesync,
    // Run quoted-newline BEFORE validateNewlines: it detects the INVERSE case
    // (newlines INSIDE quotes, which validateNewlines ignores by design). Quoted
    // newlines let attackers split commands across lines so that line-based
    // processing (stripCommentLines) drops sensitive content.
    validateQuotedNewline,
    // CR check runs BEFORE validateNewlines — CR is a MISPARSING concern
    // (shell-quote/bash tokenization differential), LF is not.
    validateCarriageReturn,
    validateNewlines,
    validateIFSInjection,
    validateProcEnvironAccess,
    validateDangerousPatterns,
    validateRedirections,
    validateBackslashEscapedWhitespace,
    validateBackslashEscapedOperators,
    validateUnicodeWhitespace,
    validateMidWordHash,
    validateBraceExpansion,
    validateZshDangerousCommands,
    // Run malformed token check last - other validators should catch specific patterns first
    // (e.g., $() substitution, backticks, etc.) since they have more precise error messages
    validateMalformedTokenInjection
  ];
  let deferredNonMisparsingResult = null;
  for (const validator of validators) {
    const result = validator(context);
    if (result.behavior === "ask") {
      if (nonMisparsingValidators.has(validator)) {
        if (deferredNonMisparsingResult === null) {
          deferredNonMisparsingResult = result;
        }
        continue;
      }
      return { ...result, isBashSecurityCheckForMisparsing: true };
    }
  }
  if (deferredNonMisparsingResult !== null) {
    return deferredNonMisparsingResult;
  }
  return {
    behavior: "passthrough",
    message: "Command passed all security checks"
  };
}
async function bashCommandIsSafeAsync_DEPRECATED(command, onDivergence) {
  const parsed = await ParsedCommand.parse(command);
  const tsAnalysis = parsed?.getTreeSitterAnalysis() ?? null;
  if (!tsAnalysis) {
    return bashCommandIsSafe_DEPRECATED(command);
  }
  if (CONTROL_CHAR_RE.test(command)) {
    logEvent("tengu_bash_security_check_triggered", {
      checkId: BASH_SECURITY_CHECK_IDS.CONTROL_CHARACTERS
    });
    return {
      behavior: "ask",
      message: "Command contains non-printable control characters that could be used to bypass security checks",
      isBashSecurityCheckForMisparsing: true
    };
  }
  if (hasShellQuoteSingleQuoteBug(command)) {
    return {
      behavior: "ask",
      message: "Command contains single-quoted backslash pattern that could bypass security checks",
      isBashSecurityCheckForMisparsing: true
    };
  }
  const { processedCommand } = extractHeredocs(command, { quotedOnly: true });
  const baseCommand = command.split(" ")[0] || "";
  const tsQuote = tsAnalysis.quoteContext;
  const regexQuote = extractQuotedContent(
    processedCommand,
    baseCommand === "jq"
  );
  const withDoubleQuotes = tsQuote.withDoubleQuotes;
  const fullyUnquoted = tsQuote.fullyUnquoted;
  const unquotedKeepQuoteChars = tsQuote.unquotedKeepQuoteChars;
  const context = {
    originalCommand: command,
    baseCommand,
    unquotedContent: withDoubleQuotes,
    fullyUnquotedContent: stripSafeRedirections(fullyUnquoted),
    fullyUnquotedPreStrip: fullyUnquoted,
    unquotedKeepQuoteChars,
    treeSitter: tsAnalysis
  };
  if (!tsAnalysis.dangerousPatterns.hasHeredoc) {
    const hasDivergence = tsQuote.fullyUnquoted !== regexQuote.fullyUnquoted || tsQuote.withDoubleQuotes !== regexQuote.withDoubleQuotes;
    if (hasDivergence) {
      if (onDivergence) {
        onDivergence();
      } else {
        logEvent("tengu_tree_sitter_security_divergence", {
          quoteContextDivergence: true
        });
      }
    }
  }
  const earlyValidators = [
    validateEmpty,
    validateIncompleteCommands,
    validateSafeCommandSubstitution,
    validateGitCommit
  ];
  for (const validator of earlyValidators) {
    const result = validator(context);
    if (result.behavior === "allow") {
      return {
        behavior: "passthrough",
        message: result.decisionReason?.type === "other" || result.decisionReason?.type === "safetyCheck" ? result.decisionReason.reason : "Command allowed"
      };
    }
    if (result.behavior !== "passthrough") {
      return result.behavior === "ask" ? { ...result, isBashSecurityCheckForMisparsing: true } : result;
    }
  }
  const nonMisparsingValidators = /* @__PURE__ */ new Set([
    validateNewlines,
    validateRedirections
  ]);
  const validators = [
    validateJqCommand,
    validateObfuscatedFlags,
    validateShellMetacharacters,
    validateDangerousVariables,
    validateCommentQuoteDesync,
    validateQuotedNewline,
    validateCarriageReturn,
    validateNewlines,
    validateIFSInjection,
    validateProcEnvironAccess,
    validateDangerousPatterns,
    validateRedirections,
    validateBackslashEscapedWhitespace,
    validateBackslashEscapedOperators,
    validateUnicodeWhitespace,
    validateMidWordHash,
    validateBraceExpansion,
    validateZshDangerousCommands,
    validateMalformedTokenInjection
  ];
  let deferredNonMisparsingResult = null;
  for (const validator of validators) {
    const result = validator(context);
    if (result.behavior === "ask") {
      if (nonMisparsingValidators.has(validator)) {
        if (deferredNonMisparsingResult === null) {
          deferredNonMisparsingResult = result;
        }
        continue;
      }
      return { ...result, isBashSecurityCheckForMisparsing: true };
    }
  }
  if (deferredNonMisparsingResult !== null) {
    return deferredNonMisparsingResult;
  }
  return {
    behavior: "passthrough",
    message: "Command passed all security checks"
  };
}
export {
  bashCommandIsSafeAsync_DEPRECATED,
  bashCommandIsSafe_DEPRECATED,
  hasSafeHeredocSubstitution,
  stripSafeHeredocSubstitutions
};
