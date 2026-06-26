import { writeFile } from "fs/promises";
import { join } from "path";
import {
  logEvent
} from "../services/analytics/index.js";
import { toError } from "./errors.js";
import { formatFileSize } from "./format.js";
import { logError } from "./log.js";
import { ensureToolResultsDir, getToolResultsDir } from "./toolResultStorage.js";
function getFormatDescription(type, schema) {
  switch (type) {
    case "toolResult":
      return "Plain text";
    case "structuredContent":
      return schema ? `JSON with schema: ${schema}` : "JSON";
    case "contentArray":
      return schema ? `JSON array with schema: ${schema}` : "JSON array";
  }
}
function getLargeOutputInstructions(rawOutputPath, contentLength, formatDescription, maxReadLength) {
  const baseInstructions = `Error: result (${contentLength.toLocaleString()} characters) exceeds maximum allowed tokens. Output has been saved to ${rawOutputPath}.
Format: ${formatDescription}
Use offset and limit parameters to read specific portions of the file, search within it for specific content, and jq to make structured queries.
REQUIREMENTS FOR SUMMARIZATION/ANALYSIS/REVIEW:
- You MUST read the content from the file at ${rawOutputPath} in sequential chunks until 100% of the content has been read.
`;
  const truncationWarning = maxReadLength ? `- If you receive truncation warnings when reading the file ("[N lines truncated]"), reduce the chunk size until you have read 100% of the content without truncation ***DO NOT PROCEED UNTIL YOU HAVE DONE THIS***. Bash output is limited to ${maxReadLength.toLocaleString()} chars.
` : `- If you receive truncation warnings when reading the file, reduce the chunk size until you have read 100% of the content without truncation.
`;
  const completionRequirement = `- Before producing ANY summary or analysis, you MUST explicitly describe what portion of the content you have read. ***If you did not read the entire content, you MUST explicitly state this.***
`;
  return baseInstructions + truncationWarning + completionRequirement;
}
function extensionForMimeType(mimeType) {
  if (!mimeType) return "bin";
  const mt = (mimeType.split(";")[0] ?? "").trim().toLowerCase();
  switch (mt) {
    case "application/pdf":
      return "pdf";
    case "application/json":
      return "json";
    case "text/csv":
      return "csv";
    case "text/plain":
      return "txt";
    case "text/html":
      return "html";
    case "text/markdown":
      return "md";
    case "application/zip":
      return "zip";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "docx";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return "xlsx";
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return "pptx";
    case "application/msword":
      return "doc";
    case "application/vnd.ms-excel":
      return "xls";
    case "audio/mpeg":
      return "mp3";
    case "audio/wav":
      return "wav";
    case "audio/ogg":
      return "ogg";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    default:
      return "bin";
  }
}
function isBinaryContentType(contentType) {
  if (!contentType) return false;
  const mt = (contentType.split(";")[0] ?? "").trim().toLowerCase();
  if (mt.startsWith("text/")) return false;
  if (mt.endsWith("+json") || mt === "application/json") return false;
  if (mt.endsWith("+xml") || mt === "application/xml") return false;
  if (mt.startsWith("application/javascript")) return false;
  if (mt === "application/x-www-form-urlencoded") return false;
  return true;
}
async function persistBinaryContent(bytes, mimeType, persistId) {
  await ensureToolResultsDir();
  const ext = extensionForMimeType(mimeType);
  const filepath = join(getToolResultsDir(), `${persistId}.${ext}`);
  try {
    await writeFile(filepath, bytes);
  } catch (error) {
    const err = toError(error);
    logError(err);
    return { error: err.message };
  }
  logEvent("tengu_binary_content_persisted", {
    mimeType: mimeType ?? "unknown",
    sizeBytes: bytes.length,
    ext
  });
  return { filepath, size: bytes.length, ext };
}
function getBinaryBlobSavedMessage(filepath, mimeType, size, sourceDescription) {
  const mt = mimeType || "unknown type";
  return `${sourceDescription}Binary content (${mt}, ${formatFileSize(size)}) saved to ${filepath}`;
}
export {
  extensionForMimeType,
  getBinaryBlobSavedMessage,
  getFormatDescription,
  getLargeOutputInstructions,
  isBinaryContentType,
  persistBinaryContent
};
