import { isAbsolute, normalize } from "path";
import { logForDebugging } from "../debug.js";
import { isENOENT } from "../errors.js";
import { getFsImplementation } from "../fsOperations.js";
import { containsPathTraversal } from "../path.js";
const LIMITS = {
  MAX_FILE_SIZE: 512 * 1024 * 1024,
  // 512MB per file
  MAX_TOTAL_SIZE: 1024 * 1024 * 1024,
  // 1024MB total uncompressed
  MAX_FILE_COUNT: 1e5,
  // Maximum number of files
  MAX_COMPRESSION_RATIO: 50,
  // Anything above 50:1 is suspicious
  MIN_COMPRESSION_RATIO: 0.5
  // Below 0.5:1 might indicate already compressed malicious content
};
function isPathSafe(filePath) {
  if (containsPathTraversal(filePath)) {
    return false;
  }
  const normalized = normalize(filePath);
  if (isAbsolute(normalized)) {
    return false;
  }
  return true;
}
function validateZipFile(file, state) {
  state.fileCount++;
  let error;
  if (state.fileCount > LIMITS.MAX_FILE_COUNT) {
    error = `Archive contains too many files: ${state.fileCount} (max: ${LIMITS.MAX_FILE_COUNT})`;
  }
  if (!isPathSafe(file.name)) {
    error = `Unsafe file path detected: "${file.name}". Path traversal or absolute paths are not allowed.`;
  }
  const fileSize = file.originalSize || 0;
  if (fileSize > LIMITS.MAX_FILE_SIZE) {
    error = `File "${file.name}" is too large: ${Math.round(fileSize / 1024 / 1024)}MB (max: ${Math.round(LIMITS.MAX_FILE_SIZE / 1024 / 1024)}MB)`;
  }
  state.totalUncompressedSize += fileSize;
  if (state.totalUncompressedSize > LIMITS.MAX_TOTAL_SIZE) {
    error = `Archive total size is too large: ${Math.round(state.totalUncompressedSize / 1024 / 1024)}MB (max: ${Math.round(LIMITS.MAX_TOTAL_SIZE / 1024 / 1024)}MB)`;
  }
  const currentRatio = state.totalUncompressedSize / state.compressedSize;
  if (currentRatio > LIMITS.MAX_COMPRESSION_RATIO) {
    error = `Suspicious compression ratio detected: ${currentRatio.toFixed(1)}:1 (max: ${LIMITS.MAX_COMPRESSION_RATIO}:1). This may be a zip bomb.`;
  }
  return error ? { isValid: false, error } : { isValid: true };
}
async function unzipFile(zipData) {
  const { unzipSync } = await import("fflate");
  const compressedSize = zipData.length;
  const state = {
    fileCount: 0,
    totalUncompressedSize: 0,
    compressedSize,
    errors: []
  };
  const result = unzipSync(new Uint8Array(zipData), {
    filter: (file) => {
      const validationResult = validateZipFile(file, state);
      if (!validationResult.isValid) {
        throw new Error(validationResult.error);
      }
      return true;
    }
  });
  logForDebugging(
    `Zip extraction completed: ${state.fileCount} files, ${Math.round(state.totalUncompressedSize / 1024)}KB uncompressed`
  );
  return result;
}
function parseZipModes(data) {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const modes = {};
  const minEocd = Math.max(0, buf.length - 22 - 65535);
  let eocd = -1;
  for (let i = buf.length - 22; i >= minEocd; i--) {
    if (buf.readUInt32LE(i) === 101010256) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return modes;
  const entryCount = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < entryCount; i++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 33639248) break;
    const versionMadeBy = buf.readUInt16LE(off + 4);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const externalAttr = buf.readUInt32LE(off + 38);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    if (versionMadeBy >> 8 === 3) {
      const mode = externalAttr >>> 16 & 65535;
      if (mode) modes[name] = mode;
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return modes;
}
async function readAndUnzipFile(filePath) {
  const fs = getFsImplementation();
  try {
    const zipData = await fs.readFileBytes(filePath);
    return await unzipFile(zipData);
  } catch (error) {
    if (isENOENT(error)) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read or unzip file: ${errorMessage}`);
  }
}
export {
  isPathSafe,
  parseZipModes,
  readAndUnzipFile,
  unzipFile,
  validateZipFile
};
