import { createHash } from "crypto";
import { logEvent } from "../services/analytics/index.js";
function hashFilePath(filePath) {
  return createHash("sha256").update(filePath).digest("hex").slice(0, 16);
}
function hashFileContent(content) {
  return createHash("sha256").update(content).digest("hex");
}
const MAX_CONTENT_HASH_SIZE = 100 * 1024;
function logFileOperation(params) {
  const metadata = {
    operation: params.operation,
    tool: params.tool,
    filePathHash: hashFilePath(params.filePath)
  };
  if (params.content !== void 0 && params.content.length <= MAX_CONTENT_HASH_SIZE) {
    metadata.contentHash = hashFileContent(params.content);
  }
  if (params.type !== void 0) {
    metadata.type = params.type;
  }
  logEvent("tengu_file_operation", metadata);
}
export {
  logFileOperation
};
