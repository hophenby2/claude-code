import { logForDebugging } from "./debug.js";
import { getFsImplementation, safeResolvePath } from "./fsOperations.js";
function detectEncodingForResolvedPath(resolvedPath) {
  const { buffer, bytesRead } = getFsImplementation().readSync(resolvedPath, {
    length: 4096
  });
  if (bytesRead === 0) {
    return "utf8";
  }
  if (bytesRead >= 2) {
    if (buffer[0] === 255 && buffer[1] === 254) return "utf16le";
  }
  if (bytesRead >= 3 && buffer[0] === 239 && buffer[1] === 187 && buffer[2] === 191) {
    return "utf8";
  }
  return "utf8";
}
function detectLineEndingsForString(content) {
  let crlfCount = 0;
  let lfCount = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\n") {
      if (i > 0 && content[i - 1] === "\r") {
        crlfCount++;
      } else {
        lfCount++;
      }
    }
  }
  return crlfCount > lfCount ? "CRLF" : "LF";
}
function readFileSyncWithMetadata(filePath) {
  const fs = getFsImplementation();
  const { resolvedPath, isSymlink } = safeResolvePath(fs, filePath);
  if (isSymlink) {
    logForDebugging(`Reading through symlink: ${filePath} -> ${resolvedPath}`);
  }
  const encoding = detectEncodingForResolvedPath(resolvedPath);
  const raw = fs.readFileSync(resolvedPath, { encoding });
  const lineEndings = detectLineEndingsForString(raw.slice(0, 4096));
  return {
    content: raw.replaceAll("\r\n", "\n"),
    encoding,
    lineEndings
  };
}
function readFileSync(filePath) {
  return readFileSyncWithMetadata(filePath).content;
}
export {
  detectEncodingForResolvedPath,
  detectLineEndingsForString,
  readFileSync,
  readFileSyncWithMetadata
};
