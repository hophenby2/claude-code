import { getPastedTextRefNumLines } from "../../history.js";
const TRUNCATION_THRESHOLD = 1e4;
const PREVIEW_LENGTH = 1e3;
function maybeTruncateMessageForInput(text, nextPasteId) {
  if (text.length <= TRUNCATION_THRESHOLD) {
    return {
      truncatedText: text,
      placeholderContent: ""
    };
  }
  const startLength = Math.floor(PREVIEW_LENGTH / 2);
  const endLength = Math.floor(PREVIEW_LENGTH / 2);
  const startText = text.slice(0, startLength);
  const endText = text.slice(-endLength);
  const placeholderContent = text.slice(startLength, -endLength);
  const truncatedLines = getPastedTextRefNumLines(placeholderContent);
  const placeholderId = nextPasteId;
  const placeholderRef = formatTruncatedTextRef(placeholderId, truncatedLines);
  const truncatedText = startText + placeholderRef + endText;
  return {
    truncatedText,
    placeholderContent
  };
}
function formatTruncatedTextRef(id, numLines) {
  return `[...Truncated text #${id} +${numLines} lines...]`;
}
function maybeTruncateInput(input, pastedContents) {
  const existingIds = Object.keys(pastedContents).map(Number);
  const nextPasteId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
  const { truncatedText, placeholderContent } = maybeTruncateMessageForInput(
    input,
    nextPasteId
  );
  if (!placeholderContent) {
    return { newInput: input, newPastedContents: pastedContents };
  }
  return {
    newInput: truncatedText,
    newPastedContents: {
      ...pastedContents,
      [nextPasteId]: {
        id: nextPasteId,
        type: "text",
        content: placeholderContent
      }
    }
  };
}
export {
  maybeTruncateInput,
  maybeTruncateMessageForInput
};
