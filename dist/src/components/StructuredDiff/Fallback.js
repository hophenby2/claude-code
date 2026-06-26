import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { diffWordsWithSpace } from "diff";
import { stringWidth } from "../../ink/stringWidth.js";
import { Box, NoSelect, Text, useTheme, wrapText } from "../../ink.js";
const CHANGE_THRESHOLD = 0.4;
function StructuredDiffFallback(t0) {
  const $ = _c(10);
  const {
    patch,
    dim,
    width
  } = t0;
  const [theme] = useTheme();
  let t1;
  if ($[0] !== dim || $[1] !== patch.lines || $[2] !== patch.oldStart || $[3] !== theme || $[4] !== width) {
    t1 = formatDiff(patch.lines, patch.oldStart, width, dim, theme);
    $[0] = dim;
    $[1] = patch.lines;
    $[2] = patch.oldStart;
    $[3] = theme;
    $[4] = width;
    $[5] = t1;
  } else {
    t1 = $[5];
  }
  const diff = t1;
  let t2;
  if ($[6] !== diff) {
    t2 = diff.map(_temp);
    $[6] = diff;
    $[7] = t2;
  } else {
    t2 = $[7];
  }
  let t3;
  if ($[8] !== t2) {
    t3 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", flexGrow: 1, children: t2 });
    $[8] = t2;
    $[9] = t3;
  } else {
    t3 = $[9];
  }
  return t3;
}
function _temp(node, i) {
  return /* @__PURE__ */ jsx(Box, { children: node }, i);
}
function transformLinesToObjects(lines) {
  return lines.map((code) => {
    if (code.startsWith("+")) {
      return {
        code: code.slice(1),
        i: 0,
        type: "add",
        originalCode: code.slice(1)
      };
    }
    if (code.startsWith("-")) {
      return {
        code: code.slice(1),
        i: 0,
        type: "remove",
        originalCode: code.slice(1)
      };
    }
    return {
      code: code.slice(1),
      i: 0,
      type: "nochange",
      originalCode: code.slice(1)
    };
  });
}
function processAdjacentLines(lineObjects) {
  const processedLines = [];
  let i = 0;
  while (i < lineObjects.length) {
    const current = lineObjects[i];
    if (!current) {
      i++;
      continue;
    }
    if (current.type === "remove") {
      const removeLines = [current];
      let j = i + 1;
      while (j < lineObjects.length && lineObjects[j]?.type === "remove") {
        const line = lineObjects[j];
        if (line) {
          removeLines.push(line);
        }
        j++;
      }
      const addLines = [];
      while (j < lineObjects.length && lineObjects[j]?.type === "add") {
        const line = lineObjects[j];
        if (line) {
          addLines.push(line);
        }
        j++;
      }
      if (removeLines.length > 0 && addLines.length > 0) {
        const pairCount = Math.min(removeLines.length, addLines.length);
        for (let k = 0; k < pairCount; k++) {
          const removeLine = removeLines[k];
          const addLine = addLines[k];
          if (removeLine && addLine) {
            removeLine.wordDiff = true;
            addLine.wordDiff = true;
            removeLine.matchedLine = addLine;
            addLine.matchedLine = removeLine;
          }
        }
        processedLines.push(...removeLines.filter(Boolean));
        processedLines.push(...addLines.filter(Boolean));
        i = j;
      } else {
        processedLines.push(current);
        i++;
      }
    } else {
      processedLines.push(current);
      i++;
    }
  }
  return processedLines;
}
function calculateWordDiffs(oldText, newText) {
  const result = diffWordsWithSpace(oldText, newText, {
    ignoreCase: false
  });
  return result;
}
function generateWordDiffElements(item, width, maxWidth, dim, overrideTheme) {
  const {
    type,
    i,
    wordDiff,
    matchedLine,
    originalCode
  } = item;
  if (!wordDiff || !matchedLine) {
    return null;
  }
  const removedLineText = type === "remove" ? originalCode : matchedLine.originalCode;
  const addedLineText = type === "remove" ? matchedLine.originalCode : originalCode;
  const wordDiffs = calculateWordDiffs(removedLineText, addedLineText);
  const totalLength = removedLineText.length + addedLineText.length;
  const changedLength = wordDiffs.filter((part) => part.added || part.removed).reduce((sum, part) => sum + part.value.length, 0);
  const changeRatio = changedLength / totalLength;
  if (changeRatio > CHANGE_THRESHOLD || dim) {
    return null;
  }
  const diffPrefix = type === "add" ? "+" : "-";
  const diffPrefixWidth = diffPrefix.length;
  const availableContentWidth = Math.max(1, width - maxWidth - 1 - diffPrefixWidth);
  const wrappedLines = [];
  let currentLine = [];
  let currentLineWidth = 0;
  wordDiffs.forEach((part, partIndex) => {
    let shouldShow = false;
    let partBgColor;
    if (type === "add") {
      if (part.added) {
        shouldShow = true;
        partBgColor = "diffAddedWord";
      } else if (!part.removed) {
        shouldShow = true;
      }
    } else if (type === "remove") {
      if (part.removed) {
        shouldShow = true;
        partBgColor = "diffRemovedWord";
      } else if (!part.added) {
        shouldShow = true;
      }
    }
    if (!shouldShow) return;
    const partWrapped = wrapText(part.value, availableContentWidth, "wrap");
    const partLines = partWrapped.split("\n");
    partLines.forEach((partLine, lineIdx) => {
      if (!partLine) return;
      if (lineIdx > 0 || currentLineWidth + stringWidth(partLine) > availableContentWidth) {
        if (currentLine.length > 0) {
          wrappedLines.push({
            content: [...currentLine],
            contentWidth: currentLineWidth
          });
          currentLine = [];
          currentLineWidth = 0;
        }
      }
      currentLine.push(/* @__PURE__ */ jsx(Text, { backgroundColor: partBgColor, children: partLine }, `part-${partIndex}-${lineIdx}`));
      currentLineWidth += stringWidth(partLine);
    });
  });
  if (currentLine.length > 0) {
    wrappedLines.push({
      content: currentLine,
      contentWidth: currentLineWidth
    });
  }
  return wrappedLines.map(({
    content,
    contentWidth
  }, lineIndex) => {
    const key = `${type}-${i}-${lineIndex}`;
    const lineBgColor = type === "add" ? dim ? "diffAddedDimmed" : "diffAdded" : dim ? "diffRemovedDimmed" : "diffRemoved";
    const lineNum = lineIndex === 0 ? i : void 0;
    const lineNumStr = (lineNum !== void 0 ? lineNum.toString().padStart(maxWidth) : " ".repeat(maxWidth)) + " ";
    const usedWidth = lineNumStr.length + diffPrefixWidth + contentWidth;
    const padding = Math.max(0, width - usedWidth);
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
      /* @__PURE__ */ jsx(NoSelect, { fromLeftEdge: true, children: /* @__PURE__ */ jsxs(Text, { color: overrideTheme ? "text" : void 0, backgroundColor: lineBgColor, dimColor: dim, children: [
        lineNumStr,
        diffPrefix
      ] }) }),
      /* @__PURE__ */ jsxs(Text, { color: overrideTheme ? "text" : void 0, backgroundColor: lineBgColor, dimColor: dim, children: [
        content,
        " ".repeat(padding)
      ] })
    ] }, key);
  });
}
function formatDiff(lines, startingLineNumber, width, dim, overrideTheme) {
  const safeWidth = Math.max(1, Math.floor(width));
  const lineObjects = transformLinesToObjects(lines);
  const processedLines = processAdjacentLines(lineObjects);
  const ls = numberDiffLines(processedLines, startingLineNumber);
  const maxLineNumber = Math.max(...ls.map(({
    i
  }) => i), 0);
  const maxWidth = Math.max(maxLineNumber.toString().length + 1, 0);
  return ls.flatMap((item) => {
    const {
      type,
      code,
      i,
      wordDiff,
      matchedLine
    } = item;
    if (wordDiff && matchedLine) {
      const wordDiffElements = generateWordDiffElements(item, safeWidth, maxWidth, dim, overrideTheme);
      if (wordDiffElements !== null) {
        return wordDiffElements;
      }
    }
    const diffPrefixWidth = 2;
    const availableContentWidth = Math.max(1, safeWidth - maxWidth - 1 - diffPrefixWidth);
    const wrappedText = wrapText(code, availableContentWidth, "wrap");
    const wrappedLines = wrappedText.split("\n");
    return wrappedLines.map((line, lineIndex) => {
      const key = `${type}-${i}-${lineIndex}`;
      const lineNum = lineIndex === 0 ? i : void 0;
      const lineNumStr = (lineNum !== void 0 ? lineNum.toString().padStart(maxWidth) : " ".repeat(maxWidth)) + " ";
      const sigil = type === "add" ? "+" : type === "remove" ? "-" : " ";
      const contentWidth = lineNumStr.length + 1 + stringWidth(line);
      const padding = Math.max(0, safeWidth - contentWidth);
      const bgColor = type === "add" ? dim ? "diffAddedDimmed" : "diffAdded" : type === "remove" ? dim ? "diffRemovedDimmed" : "diffRemoved" : void 0;
      return /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
        /* @__PURE__ */ jsx(NoSelect, { fromLeftEdge: true, children: /* @__PURE__ */ jsxs(Text, { color: overrideTheme ? "text" : void 0, backgroundColor: bgColor, dimColor: dim || type === "nochange", children: [
          lineNumStr,
          sigil
        ] }) }),
        /* @__PURE__ */ jsxs(Text, { color: overrideTheme ? "text" : void 0, backgroundColor: bgColor, dimColor: dim, children: [
          line,
          " ".repeat(padding)
        ] })
      ] }, key);
    });
  });
}
function numberDiffLines(diff, startLine) {
  let i = startLine;
  const result = [];
  const queue = [...diff];
  while (queue.length > 0) {
    const current = queue.shift();
    const {
      code,
      type,
      originalCode,
      wordDiff,
      matchedLine
    } = current;
    const line = {
      code,
      type,
      i,
      originalCode,
      wordDiff,
      matchedLine
    };
    switch (type) {
      case "nochange":
        i++;
        result.push(line);
        break;
      case "add":
        i++;
        result.push(line);
        break;
      case "remove": {
        result.push(line);
        let numRemoved = 0;
        while (queue[0]?.type === "remove") {
          i++;
          const current2 = queue.shift();
          const {
            code: code2,
            type: type2,
            originalCode: originalCode2,
            wordDiff: wordDiff2,
            matchedLine: matchedLine2
          } = current2;
          const line2 = {
            code: code2,
            type: type2,
            i,
            originalCode: originalCode2,
            wordDiff: wordDiff2,
            matchedLine: matchedLine2
          };
          result.push(line2);
          numRemoved++;
        }
        i -= numRemoved;
        break;
      }
    }
  }
  return result;
}
export {
  StructuredDiffFallback,
  calculateWordDiffs,
  numberDiffLines,
  processAdjacentLines,
  transformLinesToObjects
};
