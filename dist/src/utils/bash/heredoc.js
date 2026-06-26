import { randomBytes } from "crypto";
const HEREDOC_PLACEHOLDER_PREFIX = "__HEREDOC_";
const HEREDOC_PLACEHOLDER_SUFFIX = "__";
function generatePlaceholderSalt() {
  return randomBytes(8).toString("hex");
}
const HEREDOC_START_PATTERN = (
  // eslint-disable-next-line custom-rules/no-lookbehind-regex -- gated by command.includes('<<') at extractHeredocs() entry
  /(?<!<)<<(?!<)(-)?[ \t]*(?:(['"])(\\?\w+)\2|\\?(\w+))/
);
function extractHeredocs(command, options) {
  const heredocs = /* @__PURE__ */ new Map();
  if (!command.includes("<<")) {
    return { processedCommand: command, heredocs };
  }
  if (/\$['"]/.test(command)) {
    return { processedCommand: command, heredocs };
  }
  const firstHeredocPos = command.indexOf("<<");
  if (firstHeredocPos > 0 && command.slice(0, firstHeredocPos).includes("`")) {
    return { processedCommand: command, heredocs };
  }
  if (firstHeredocPos > 0) {
    const beforeHeredoc = command.slice(0, firstHeredocPos);
    const openArith = (beforeHeredoc.match(/\(\(/g) || []).length;
    const closeArith = (beforeHeredoc.match(/\)\)/g) || []).length;
    if (openArith > closeArith) {
      return { processedCommand: command, heredocs };
    }
  }
  const heredocStartPattern = new RegExp(HEREDOC_START_PATTERN.source, "g");
  const heredocMatches = [];
  const skippedHeredocRanges = [];
  let match;
  let scanPos = 0;
  let scanInSingleQuote = false;
  let scanInDoubleQuote = false;
  let scanInComment = false;
  let scanDqEscapeNext = false;
  let scanPendingBackslashes = 0;
  const advanceScan = (target) => {
    for (let i = scanPos; i < target; i++) {
      const ch = command[i];
      if (ch === "\n") scanInComment = false;
      if (scanInSingleQuote) {
        if (ch === "'") scanInSingleQuote = false;
        continue;
      }
      if (scanInDoubleQuote) {
        if (scanDqEscapeNext) {
          scanDqEscapeNext = false;
          continue;
        }
        if (ch === "\\") {
          scanDqEscapeNext = true;
          continue;
        }
        if (ch === '"') scanInDoubleQuote = false;
        continue;
      }
      if (ch === "\\") {
        scanPendingBackslashes++;
        continue;
      }
      const escaped = scanPendingBackslashes % 2 === 1;
      scanPendingBackslashes = 0;
      if (escaped) continue;
      if (ch === "'") scanInSingleQuote = true;
      else if (ch === '"') scanInDoubleQuote = true;
      else if (!scanInComment && ch === "#") scanInComment = true;
    }
    scanPos = target;
  };
  while ((match = heredocStartPattern.exec(command)) !== null) {
    const startIndex = match.index;
    advanceScan(startIndex);
    if (scanInSingleQuote || scanInDoubleQuote) {
      continue;
    }
    if (scanInComment) {
      continue;
    }
    if (scanPendingBackslashes % 2 === 1) {
      continue;
    }
    let insideSkipped = false;
    for (const skipped of skippedHeredocRanges) {
      if (startIndex > skipped.contentStartIndex && startIndex < skipped.contentEndIndex) {
        insideSkipped = true;
        break;
      }
    }
    if (insideSkipped) {
      continue;
    }
    const fullMatch = match[0];
    const isDash = match[1] === "-";
    const delimiter = match[3] || match[4];
    const operatorEndIndex = startIndex + fullMatch.length;
    const quoteChar = match[2];
    if (quoteChar && command[operatorEndIndex - 1] !== quoteChar) {
      continue;
    }
    const isEscapedDelimiter = fullMatch.includes("\\");
    const isQuotedOrEscaped = !!quoteChar || isEscapedDelimiter;
    if (operatorEndIndex < command.length) {
      const nextChar = command[operatorEndIndex];
      if (!/^[ \t\n|&;()<>]$/.test(nextChar)) {
        continue;
      }
    }
    let firstNewlineOffset = -1;
    {
      let inSingleQuote = false;
      let inDoubleQuote = false;
      for (let k = operatorEndIndex; k < command.length; k++) {
        const ch = command[k];
        if (inSingleQuote) {
          if (ch === "'") inSingleQuote = false;
          continue;
        }
        if (inDoubleQuote) {
          if (ch === "\\") {
            k++;
            continue;
          }
          if (ch === '"') inDoubleQuote = false;
          continue;
        }
        if (ch === "\n") {
          firstNewlineOffset = k - operatorEndIndex;
          break;
        }
        let backslashCount = 0;
        for (let j = k - 1; j >= operatorEndIndex && command[j] === "\\"; j--) {
          backslashCount++;
        }
        if (backslashCount % 2 === 1) continue;
        if (ch === "'") inSingleQuote = true;
        else if (ch === '"') inDoubleQuote = true;
      }
    }
    if (firstNewlineOffset === -1) {
      continue;
    }
    const sameLineContent = command.slice(
      operatorEndIndex,
      operatorEndIndex + firstNewlineOffset
    );
    let trailingBackslashes = 0;
    for (let j = sameLineContent.length - 1; j >= 0; j--) {
      if (sameLineContent[j] === "\\") {
        trailingBackslashes++;
      } else {
        break;
      }
    }
    if (trailingBackslashes % 2 === 1) {
      continue;
    }
    const contentStartIndex = operatorEndIndex + firstNewlineOffset;
    const afterNewline = command.slice(contentStartIndex + 1);
    const contentLines = afterNewline.split("\n");
    let closingLineIndex = -1;
    for (let i = 0; i < contentLines.length; i++) {
      const line = contentLines[i];
      if (isDash) {
        const stripped = line.replace(/^\t*/, "");
        if (stripped === delimiter) {
          closingLineIndex = i;
          break;
        }
      } else {
        if (line === delimiter) {
          closingLineIndex = i;
          break;
        }
      }
      const eofCheckLine = isDash ? line.replace(/^\t*/, "") : line;
      if (eofCheckLine.length > delimiter.length && eofCheckLine.startsWith(delimiter)) {
        const charAfterDelimiter = eofCheckLine[delimiter.length];
        if (/^[)}`|&;(<>]$/.test(charAfterDelimiter)) {
          closingLineIndex = -1;
          break;
        }
      }
    }
    if (options?.quotedOnly && !isQuotedOrEscaped) {
      let skipContentEndIndex;
      if (closingLineIndex === -1) {
        skipContentEndIndex = command.length;
      } else {
        const skipLinesUpToClosing = contentLines.slice(0, closingLineIndex + 1);
        const skipContentLength = skipLinesUpToClosing.join("\n").length;
        skipContentEndIndex = contentStartIndex + 1 + skipContentLength;
      }
      skippedHeredocRanges.push({
        contentStartIndex,
        contentEndIndex: skipContentEndIndex
      });
      continue;
    }
    if (closingLineIndex === -1) {
      continue;
    }
    const linesUpToClosing = contentLines.slice(0, closingLineIndex + 1);
    const contentLength = linesUpToClosing.join("\n").length;
    const contentEndIndex = contentStartIndex + 1 + contentLength;
    let overlapsSkipped = false;
    for (const skipped of skippedHeredocRanges) {
      if (contentStartIndex < skipped.contentEndIndex && skipped.contentStartIndex < contentEndIndex) {
        overlapsSkipped = true;
        break;
      }
    }
    if (overlapsSkipped) {
      continue;
    }
    const operatorText = command.slice(startIndex, operatorEndIndex);
    const contentText = command.slice(contentStartIndex, contentEndIndex);
    const fullText = operatorText + contentText;
    heredocMatches.push({
      fullText,
      delimiter,
      operatorStartIndex: startIndex,
      operatorEndIndex,
      contentStartIndex,
      contentEndIndex
    });
  }
  if (heredocMatches.length === 0) {
    return { processedCommand: command, heredocs };
  }
  const topLevelHeredocs = heredocMatches.filter((candidate, _i, all) => {
    for (const other of all) {
      if (candidate === other) continue;
      if (candidate.operatorStartIndex > other.contentStartIndex && candidate.operatorStartIndex < other.contentEndIndex) {
        return false;
      }
    }
    return true;
  });
  if (topLevelHeredocs.length === 0) {
    return { processedCommand: command, heredocs };
  }
  const contentStartPositions = new Set(
    topLevelHeredocs.map((h) => h.contentStartIndex)
  );
  if (contentStartPositions.size < topLevelHeredocs.length) {
    return { processedCommand: command, heredocs };
  }
  topLevelHeredocs.sort((a, b) => b.contentEndIndex - a.contentEndIndex);
  const salt = generatePlaceholderSalt();
  let processedCommand = command;
  topLevelHeredocs.forEach((info, index) => {
    const placeholderIndex = topLevelHeredocs.length - 1 - index;
    const placeholder = `${HEREDOC_PLACEHOLDER_PREFIX}${placeholderIndex}_${salt}${HEREDOC_PLACEHOLDER_SUFFIX}`;
    heredocs.set(placeholder, info);
    processedCommand = processedCommand.slice(0, info.operatorStartIndex) + placeholder + processedCommand.slice(info.operatorEndIndex, info.contentStartIndex) + processedCommand.slice(info.contentEndIndex);
  });
  return { processedCommand, heredocs };
}
function restoreHeredocsInString(text, heredocs) {
  let result = text;
  for (const [placeholder, info] of heredocs) {
    result = result.replaceAll(placeholder, info.fullText);
  }
  return result;
}
function restoreHeredocs(parts, heredocs) {
  if (heredocs.size === 0) {
    return parts;
  }
  return parts.map((part) => restoreHeredocsInString(part, heredocs));
}
function containsHeredoc(command) {
  return HEREDOC_START_PATTERN.test(command);
}
export {
  containsHeredoc,
  extractHeredocs,
  restoreHeredocs
};
