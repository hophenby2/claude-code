import { structuredPatch } from "diff";
import { logEvent } from "../services/analytics/index.js";
import { getLocCounter } from "../bootstrap/state.js";
import { addToTotalLinesChanged } from "../cost-tracker.js";
import { count } from "./array.js";
import { convertLeadingTabsToSpaces } from "./file.js";
const CONTEXT_LINES = 3;
const DIFF_TIMEOUT_MS = 5e3;
function adjustHunkLineNumbers(hunks, offset) {
  if (offset === 0) return hunks;
  return hunks.map((h) => ({
    ...h,
    oldStart: h.oldStart + offset,
    newStart: h.newStart + offset
  }));
}
const AMPERSAND_TOKEN = "<<:AMPERSAND_TOKEN:>>";
const DOLLAR_TOKEN = "<<:DOLLAR_TOKEN:>>";
function escapeForDiff(s) {
  return s.replaceAll("&", AMPERSAND_TOKEN).replaceAll("$", DOLLAR_TOKEN);
}
function unescapeFromDiff(s) {
  return s.replaceAll(AMPERSAND_TOKEN, "&").replaceAll(DOLLAR_TOKEN, "$");
}
function countLinesChanged(patch, newFileContent) {
  let numAdditions = 0;
  let numRemovals = 0;
  if (patch.length === 0 && newFileContent) {
    numAdditions = newFileContent.split(/\r?\n/).length;
  } else {
    numAdditions = patch.reduce(
      (acc, hunk) => acc + count(hunk.lines, (_) => _.startsWith("+")),
      0
    );
    numRemovals = patch.reduce(
      (acc, hunk) => acc + count(hunk.lines, (_) => _.startsWith("-")),
      0
    );
  }
  addToTotalLinesChanged(numAdditions, numRemovals);
  getLocCounter()?.add(numAdditions, { type: "added" });
  getLocCounter()?.add(numRemovals, { type: "removed" });
  logEvent("tengu_file_changed", {
    lines_added: numAdditions,
    lines_removed: numRemovals
  });
}
function getPatchFromContents({
  filePath,
  oldContent,
  newContent,
  ignoreWhitespace = false,
  singleHunk = false
}) {
  const result = structuredPatch(
    filePath,
    filePath,
    escapeForDiff(oldContent),
    escapeForDiff(newContent),
    void 0,
    void 0,
    {
      ignoreWhitespace,
      context: singleHunk ? 1e5 : CONTEXT_LINES,
      timeout: DIFF_TIMEOUT_MS
    }
  );
  if (!result) {
    return [];
  }
  return result.hunks.map((_) => ({
    ..._,
    lines: _.lines.map(unescapeFromDiff)
  }));
}
function getPatchForDisplay({
  filePath,
  fileContents,
  edits,
  ignoreWhitespace = false
}) {
  const preparedFileContents = escapeForDiff(
    convertLeadingTabsToSpaces(fileContents)
  );
  const result = structuredPatch(
    filePath,
    filePath,
    preparedFileContents,
    edits.reduce((p, edit) => {
      const { old_string, new_string } = edit;
      const replace_all = "replace_all" in edit ? edit.replace_all : false;
      const escapedOldString = escapeForDiff(
        convertLeadingTabsToSpaces(old_string)
      );
      const escapedNewString = escapeForDiff(
        convertLeadingTabsToSpaces(new_string)
      );
      if (replace_all) {
        return p.replaceAll(escapedOldString, () => escapedNewString);
      } else {
        return p.replace(escapedOldString, () => escapedNewString);
      }
    }, preparedFileContents),
    void 0,
    void 0,
    {
      context: CONTEXT_LINES,
      ignoreWhitespace,
      timeout: DIFF_TIMEOUT_MS
    }
  );
  if (!result) {
    return [];
  }
  return result.hunks.map((_) => ({
    ..._,
    lines: _.lines.map(unescapeFromDiff)
  }));
}
export {
  CONTEXT_LINES,
  DIFF_TIMEOUT_MS,
  adjustHunkLineNumbers,
  countLinesChanged,
  getPatchForDisplay,
  getPatchFromContents
};
