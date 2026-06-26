import chalk from "chalk";
import { ctrlOToExpand } from "../components/CtrlOToExpand.js";
import { stringWidth } from "../ink/stringWidth.js";
import sliceAnsi from "./sliceAnsi.js";
const MAX_LINES_TO_SHOW = 3;
const PADDING_TO_PREVENT_OVERFLOW = 10;
function wrapText(text, wrapWidth) {
  const lines = text.split("\n");
  const wrappedLines = [];
  for (const line of lines) {
    const visibleWidth = stringWidth(line);
    if (visibleWidth <= wrapWidth) {
      wrappedLines.push(line.trimEnd());
    } else {
      let position = 0;
      while (position < visibleWidth) {
        const chunk = sliceAnsi(line, position, position + wrapWidth);
        wrappedLines.push(chunk.trimEnd());
        position += wrapWidth;
      }
    }
  }
  const remainingLines = wrappedLines.length - MAX_LINES_TO_SHOW;
  if (remainingLines === 1) {
    return {
      aboveTheFold: wrappedLines.slice(0, MAX_LINES_TO_SHOW + 1).join("\n").trimEnd(),
      remainingLines: 0
      // All lines are shown, nothing remaining
    };
  }
  return {
    aboveTheFold: wrappedLines.slice(0, MAX_LINES_TO_SHOW).join("\n").trimEnd(),
    remainingLines: Math.max(0, remainingLines)
  };
}
function renderTruncatedContent(content, terminalWidth, suppressExpandHint = false) {
  const trimmedContent = content.trimEnd();
  if (!trimmedContent) {
    return "";
  }
  const wrapWidth = Math.max(terminalWidth - PADDING_TO_PREVENT_OVERFLOW, 10);
  const maxChars = MAX_LINES_TO_SHOW * wrapWidth * 4;
  const preTruncated = trimmedContent.length > maxChars;
  const contentForWrapping = preTruncated ? trimmedContent.slice(0, maxChars) : trimmedContent;
  const { aboveTheFold, remainingLines } = wrapText(
    contentForWrapping,
    wrapWidth
  );
  const estimatedRemaining = preTruncated ? Math.max(
    remainingLines,
    Math.ceil(trimmedContent.length / wrapWidth) - MAX_LINES_TO_SHOW
  ) : remainingLines;
  return [
    aboveTheFold,
    estimatedRemaining > 0 ? chalk.dim(
      `\u2026 +${estimatedRemaining} lines${suppressExpandHint ? "" : ` ${ctrlOToExpand()}`}`
    ) : ""
  ].filter(Boolean).join("\n");
}
function isOutputLineTruncated(content) {
  let pos = 0;
  for (let i = 0; i <= MAX_LINES_TO_SHOW; i++) {
    pos = content.indexOf("\n", pos);
    if (pos === -1) return false;
    pos++;
  }
  return pos < content.length;
}
export {
  isOutputLineTruncated,
  renderTruncatedContent
};
