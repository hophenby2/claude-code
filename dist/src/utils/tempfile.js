import { createHash, randomUUID } from "crypto";
import { tmpdir } from "os";
import { join } from "path";
function generateTempFilePath(prefix = "claude-prompt", extension = ".md", options) {
  const id = options?.contentHash ? createHash("sha256").update(options.contentHash).digest("hex").slice(0, 16) : randomUUID();
  return join(tmpdir(), `${prefix}-${id}${extension}`);
}
export {
  generateTempFilePath
};
