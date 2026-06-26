import { structuredPatch } from "diff";
import { logError } from "../../utils/log.js";
import { expandPath } from "../../utils/path.js";
import { countCharInString } from "../../utils/stringUtils.js";
import {
  DIFF_TIMEOUT_MS,
  getPatchForDisplay,
  getPatchFromContents
} from "../../utils/diff.js";
import { errorMessage, isENOENT } from "../../utils/errors.js";
import {
  addLineNumbers,
  convertLeadingTabsToSpaces,
  readFileSyncCached
} from "../../utils/file.js";
const LEFT_SINGLE_CURLY_QUOTE = "\u2018";
const RIGHT_SINGLE_CURLY_QUOTE = "\u2019";
const LEFT_DOUBLE_CURLY_QUOTE = "\u201C";
const RIGHT_DOUBLE_CURLY_QUOTE = "\u201D";
function normalizeQuotes(str) {
  return str.replaceAll(LEFT_SINGLE_CURLY_QUOTE, "'").replaceAll(RIGHT_SINGLE_CURLY_QUOTE, "'").replaceAll(LEFT_DOUBLE_CURLY_QUOTE, '"').replaceAll(RIGHT_DOUBLE_CURLY_QUOTE, '"');
}
function stripTrailingWhitespace(str) {
  const lines = str.split(/(\r\n|\n|\r)/);
  let result = "";
  for (let i = 0; i < lines.length; i++) {
    const part = lines[i];
    if (part !== void 0) {
      if (i % 2 === 0) {
        result += part.replace(/\s+$/, "");
      } else {
        result += part;
      }
    }
  }
  return result;
}
function findActualString(fileContent, searchString) {
  if (fileContent.includes(searchString)) {
    return searchString;
  }
  const normalizedSearch = normalizeQuotes(searchString);
  const normalizedFile = normalizeQuotes(fileContent);
  const searchIndex = normalizedFile.indexOf(normalizedSearch);
  if (searchIndex !== -1) {
    return fileContent.substring(searchIndex, searchIndex + searchString.length);
  }
  return null;
}
function preserveQuoteStyle(oldString, actualOldString, newString) {
  if (oldString === actualOldString) {
    return newString;
  }
  const hasDoubleQuotes = actualOldString.includes(LEFT_DOUBLE_CURLY_QUOTE) || actualOldString.includes(RIGHT_DOUBLE_CURLY_QUOTE);
  const hasSingleQuotes = actualOldString.includes(LEFT_SINGLE_CURLY_QUOTE) || actualOldString.includes(RIGHT_SINGLE_CURLY_QUOTE);
  if (!hasDoubleQuotes && !hasSingleQuotes) {
    return newString;
  }
  let result = newString;
  if (hasDoubleQuotes) {
    result = applyCurlyDoubleQuotes(result);
  }
  if (hasSingleQuotes) {
    result = applyCurlySingleQuotes(result);
  }
  return result;
}
function isOpeningContext(chars, index) {
  if (index === 0) {
    return true;
  }
  const prev = chars[index - 1];
  return prev === " " || prev === "	" || prev === "\n" || prev === "\r" || prev === "(" || prev === "[" || prev === "{" || prev === "\u2014" || // em dash
  prev === "\u2013";
}
function applyCurlyDoubleQuotes(str) {
  const chars = [...str];
  const result = [];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '"') {
      result.push(
        isOpeningContext(chars, i) ? LEFT_DOUBLE_CURLY_QUOTE : RIGHT_DOUBLE_CURLY_QUOTE
      );
    } else {
      result.push(chars[i]);
    }
  }
  return result.join("");
}
function applyCurlySingleQuotes(str) {
  const chars = [...str];
  const result = [];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === "'") {
      const prev = i > 0 ? chars[i - 1] : void 0;
      const next = i < chars.length - 1 ? chars[i + 1] : void 0;
      const prevIsLetter = prev !== void 0 && new RegExp("\\p{L}", "u").test(prev);
      const nextIsLetter = next !== void 0 && new RegExp("\\p{L}", "u").test(next);
      if (prevIsLetter && nextIsLetter) {
        result.push(RIGHT_SINGLE_CURLY_QUOTE);
      } else {
        result.push(
          isOpeningContext(chars, i) ? LEFT_SINGLE_CURLY_QUOTE : RIGHT_SINGLE_CURLY_QUOTE
        );
      }
    } else {
      result.push(chars[i]);
    }
  }
  return result.join("");
}
function applyEditToFile(originalContent, oldString, newString, replaceAll = false) {
  const f = replaceAll ? (content, search, replace) => content.replaceAll(search, () => replace) : (content, search, replace) => content.replace(search, () => replace);
  if (newString !== "") {
    return f(originalContent, oldString, newString);
  }
  const stripTrailingNewline = !oldString.endsWith("\n") && originalContent.includes(oldString + "\n");
  return stripTrailingNewline ? f(originalContent, oldString + "\n", newString) : f(originalContent, oldString, newString);
}
function getPatchForEdit({
  filePath,
  fileContents,
  oldString,
  newString,
  replaceAll = false
}) {
  return getPatchForEdits({
    filePath,
    fileContents,
    edits: [
      { old_string: oldString, new_string: newString, replace_all: replaceAll }
    ]
  });
}
function getPatchForEdits({
  filePath,
  fileContents,
  edits
}) {
  let updatedFile = fileContents;
  const appliedNewStrings = [];
  if (!fileContents && edits.length === 1 && edits[0] && edits[0].old_string === "" && edits[0].new_string === "") {
    const patch2 = getPatchForDisplay({
      filePath,
      fileContents,
      edits: [
        {
          old_string: fileContents,
          new_string: updatedFile,
          replace_all: false
        }
      ]
    });
    return { patch: patch2, updatedFile: "" };
  }
  for (const edit of edits) {
    const oldStringToCheck = edit.old_string.replace(/\n+$/, "");
    for (const previousNewString of appliedNewStrings) {
      if (oldStringToCheck !== "" && previousNewString.includes(oldStringToCheck)) {
        throw new Error(
          "Cannot edit file: old_string is a substring of a new_string from a previous edit."
        );
      }
    }
    const previousContent = updatedFile;
    updatedFile = edit.old_string === "" ? edit.new_string : applyEditToFile(
      updatedFile,
      edit.old_string,
      edit.new_string,
      edit.replace_all
    );
    if (updatedFile === previousContent) {
      throw new Error("String not found in file. Failed to apply edit.");
    }
    appliedNewStrings.push(edit.new_string);
  }
  if (updatedFile === fileContents) {
    throw new Error(
      "Original and edited file match exactly. Failed to apply edit."
    );
  }
  const patch = getPatchFromContents({
    filePath,
    oldContent: convertLeadingTabsToSpaces(fileContents),
    newContent: convertLeadingTabsToSpaces(updatedFile)
  });
  return { patch, updatedFile };
}
const DIFF_SNIPPET_MAX_BYTES = 8192;
function getSnippetForTwoFileDiff(fileAContents, fileBContents) {
  const patch = structuredPatch(
    "file.txt",
    "file.txt",
    fileAContents,
    fileBContents,
    void 0,
    void 0,
    {
      context: 8,
      timeout: DIFF_TIMEOUT_MS
    }
  );
  if (!patch) {
    return "";
  }
  const full = patch.hunks.map((_) => ({
    startLine: _.oldStart,
    content: _.lines.filter((_2) => !_2.startsWith("-") && !_2.startsWith("\\")).map((_2) => _2.slice(1)).join("\n")
  })).map(addLineNumbers).join("\n...\n");
  if (full.length <= DIFF_SNIPPET_MAX_BYTES) {
    return full;
  }
  const cutoff = full.lastIndexOf("\n", DIFF_SNIPPET_MAX_BYTES);
  const kept = cutoff > 0 ? full.slice(0, cutoff) : full.slice(0, DIFF_SNIPPET_MAX_BYTES);
  const remaining = countCharInString(full, "\n", kept.length) + 1;
  return `${kept}

... [${remaining} lines truncated] ...`;
}
const CONTEXT_LINES = 4;
function getSnippetForPatch(patch, newFile) {
  if (patch.length === 0) {
    return { formattedSnippet: "", startLine: 1 };
  }
  let minLine = Infinity;
  let maxLine = -Infinity;
  for (const hunk of patch) {
    if (hunk.oldStart < minLine) {
      minLine = hunk.oldStart;
    }
    const hunkEnd = hunk.oldStart + (hunk.newLines || 0) - 1;
    if (hunkEnd > maxLine) {
      maxLine = hunkEnd;
    }
  }
  const startLine = Math.max(1, minLine - CONTEXT_LINES);
  const endLine = maxLine + CONTEXT_LINES;
  const fileLines = newFile.split(/\r?\n/);
  const snippetLines = fileLines.slice(startLine - 1, endLine);
  const snippet = snippetLines.join("\n");
  const formattedSnippet = addLineNumbers({
    content: snippet,
    startLine
  });
  return { formattedSnippet, startLine };
}
function getSnippet(originalFile, oldString, newString, contextLines = 4) {
  const before = originalFile.split(oldString)[0] ?? "";
  const replacementLine = before.split(/\r?\n/).length - 1;
  const newFileLines = applyEditToFile(
    originalFile,
    oldString,
    newString
  ).split(/\r?\n/);
  const startLine = Math.max(0, replacementLine - contextLines);
  const endLine = replacementLine + contextLines + newString.split(/\r?\n/).length;
  const snippetLines = newFileLines.slice(startLine, endLine);
  const snippet = snippetLines.join("\n");
  return { snippet, startLine: startLine + 1 };
}
function getEditsForPatch(patch) {
  return patch.map((hunk) => {
    const contextLines = [];
    const oldLines = [];
    const newLines = [];
    for (const line of hunk.lines) {
      if (line.startsWith(" ")) {
        contextLines.push(line.slice(1));
        oldLines.push(line.slice(1));
        newLines.push(line.slice(1));
      } else if (line.startsWith("-")) {
        oldLines.push(line.slice(1));
      } else if (line.startsWith("+")) {
        newLines.push(line.slice(1));
      }
    }
    return {
      old_string: oldLines.join("\n"),
      new_string: newLines.join("\n"),
      replace_all: false
    };
  });
}
const DESANITIZATIONS = {
  "<fnr>": "<function_results>",
  "<n>": "<name>",
  "</n>": "</name>",
  "<o>": "<output>",
  "</o>": "</output>",
  "<e>": "<error>",
  "</e>": "</error>",
  "<s>": "<system>",
  "</s>": "</system>",
  "<r>": "<result>",
  "</r>": "</result>",
  "< META_START >": "<META_START>",
  "< META_END >": "<META_END>",
  "< EOT >": "<EOT>",
  "< META >": "<META>",
  "< SOS >": "<SOS>",
  "\n\nH:": "\n\nHuman:",
  "\n\nA:": "\n\nAssistant:"
};
function desanitizeMatchString(matchString) {
  let result = matchString;
  const appliedReplacements = [];
  for (const [from, to] of Object.entries(DESANITIZATIONS)) {
    const beforeReplace = result;
    result = result.replaceAll(from, to);
    if (beforeReplace !== result) {
      appliedReplacements.push({ from, to });
    }
  }
  return { result, appliedReplacements };
}
function normalizeFileEditInput({
  file_path,
  edits
}) {
  if (edits.length === 0) {
    return { file_path, edits };
  }
  const isMarkdown = /\.(md|mdx)$/i.test(file_path);
  try {
    const fullPath = expandPath(file_path);
    const fileContent = readFileSyncCached(fullPath);
    return {
      file_path,
      edits: edits.map(({ old_string, new_string, replace_all }) => {
        const normalizedNewString = isMarkdown ? new_string : stripTrailingWhitespace(new_string);
        if (fileContent.includes(old_string)) {
          return {
            old_string,
            new_string: normalizedNewString,
            replace_all
          };
        }
        const { result: desanitizedOldString, appliedReplacements } = desanitizeMatchString(old_string);
        if (fileContent.includes(desanitizedOldString)) {
          let desanitizedNewString = normalizedNewString;
          for (const { from, to } of appliedReplacements) {
            desanitizedNewString = desanitizedNewString.replaceAll(from, to);
          }
          return {
            old_string: desanitizedOldString,
            new_string: desanitizedNewString,
            replace_all
          };
        }
        return {
          old_string,
          new_string: normalizedNewString,
          replace_all
        };
      })
    };
  } catch (error) {
    if (!isENOENT(error)) {
      logError(error);
    }
  }
  return { file_path, edits };
}
function areFileEditsEquivalent(edits1, edits2, originalContent) {
  if (edits1.length === edits2.length && edits1.every((edit1, index) => {
    const edit2 = edits2[index];
    return edit2 !== void 0 && edit1.old_string === edit2.old_string && edit1.new_string === edit2.new_string && edit1.replace_all === edit2.replace_all;
  })) {
    return true;
  }
  let result1 = null;
  let error1 = null;
  let result2 = null;
  let error2 = null;
  try {
    result1 = getPatchForEdits({
      filePath: "temp",
      fileContents: originalContent,
      edits: edits1
    });
  } catch (e) {
    error1 = errorMessage(e);
  }
  try {
    result2 = getPatchForEdits({
      filePath: "temp",
      fileContents: originalContent,
      edits: edits2
    });
  } catch (e) {
    error2 = errorMessage(e);
  }
  if (error1 !== null && error2 !== null) {
    return error1 === error2;
  }
  if (error1 !== null || error2 !== null) {
    return false;
  }
  return result1.updatedFile === result2.updatedFile;
}
function areFileEditsInputsEquivalent(input1, input2) {
  if (input1.file_path !== input2.file_path) {
    return false;
  }
  if (input1.edits.length === input2.edits.length && input1.edits.every((edit1, index) => {
    const edit2 = input2.edits[index];
    return edit2 !== void 0 && edit1.old_string === edit2.old_string && edit1.new_string === edit2.new_string && edit1.replace_all === edit2.replace_all;
  })) {
    return true;
  }
  let fileContent = "";
  try {
    fileContent = readFileSyncCached(input1.file_path);
  } catch (error) {
    if (!isENOENT(error)) {
      throw error;
    }
  }
  return areFileEditsEquivalent(input1.edits, input2.edits, fileContent);
}
export {
  LEFT_DOUBLE_CURLY_QUOTE,
  LEFT_SINGLE_CURLY_QUOTE,
  RIGHT_DOUBLE_CURLY_QUOTE,
  RIGHT_SINGLE_CURLY_QUOTE,
  applyEditToFile,
  areFileEditsEquivalent,
  areFileEditsInputsEquivalent,
  findActualString,
  getEditsForPatch,
  getPatchForEdit,
  getPatchForEdits,
  getSnippet,
  getSnippetForPatch,
  getSnippetForTwoFileDiff,
  normalizeFileEditInput,
  normalizeQuotes,
  preserveQuoteStyle,
  stripTrailingWhitespace
};
