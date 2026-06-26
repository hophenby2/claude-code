import { mkdir, open } from "fs/promises";
import { join } from "path";
import { getSessionId } from "../bootstrap/state.js";
import { logForDebugging } from "./debug.js";
import { getClaudeConfigHomeDir } from "./envUtils.js";
import { getFsImplementation } from "./fsOperations.js";
const IMAGE_STORE_DIR = "image-cache";
const MAX_STORED_IMAGE_PATHS = 200;
const storedImagePaths = /* @__PURE__ */ new Map();
function getImageStoreDir() {
  return join(getClaudeConfigHomeDir(), IMAGE_STORE_DIR, getSessionId());
}
async function ensureImageStoreDir() {
  const dir = getImageStoreDir();
  await mkdir(dir, { recursive: true });
}
function getImagePath(imageId, mediaType) {
  const extension = mediaType.split("/")[1] || "png";
  return join(getImageStoreDir(), `${imageId}.${extension}`);
}
function cacheImagePath(content) {
  if (content.type !== "image") {
    return null;
  }
  const imagePath = getImagePath(content.id, content.mediaType || "image/png");
  evictOldestIfAtCap();
  storedImagePaths.set(content.id, imagePath);
  return imagePath;
}
async function storeImage(content) {
  if (content.type !== "image") {
    return null;
  }
  try {
    await ensureImageStoreDir();
    const imagePath = getImagePath(content.id, content.mediaType || "image/png");
    const fh = await open(imagePath, "w", 384);
    try {
      await fh.writeFile(content.content, { encoding: "base64" });
      await fh.datasync();
    } finally {
      await fh.close();
    }
    evictOldestIfAtCap();
    storedImagePaths.set(content.id, imagePath);
    logForDebugging(`Stored image ${content.id} to ${imagePath}`);
    return imagePath;
  } catch (error) {
    logForDebugging(`Failed to store image: ${error}`);
    return null;
  }
}
async function storeImages(pastedContents) {
  const pathMap = /* @__PURE__ */ new Map();
  for (const [id, content] of Object.entries(pastedContents)) {
    if (content.type === "image") {
      const path = await storeImage(content);
      if (path) {
        pathMap.set(Number(id), path);
      }
    }
  }
  return pathMap;
}
function getStoredImagePath(imageId) {
  return storedImagePaths.get(imageId) ?? null;
}
function clearStoredImagePaths() {
  storedImagePaths.clear();
}
function evictOldestIfAtCap() {
  while (storedImagePaths.size >= MAX_STORED_IMAGE_PATHS) {
    const oldest = storedImagePaths.keys().next().value;
    if (oldest !== void 0) {
      storedImagePaths.delete(oldest);
    } else {
      break;
    }
  }
}
async function cleanupOldImageCaches() {
  const fsImpl = getFsImplementation();
  const baseDir = join(getClaudeConfigHomeDir(), IMAGE_STORE_DIR);
  const currentSessionId = getSessionId();
  try {
    let sessionDirs;
    try {
      sessionDirs = await fsImpl.readdir(baseDir);
    } catch {
      return;
    }
    for (const sessionDir of sessionDirs) {
      if (sessionDir.name === currentSessionId) {
        continue;
      }
      const sessionPath = join(baseDir, sessionDir.name);
      try {
        await fsImpl.rm(sessionPath, { recursive: true, force: true });
        logForDebugging(`Cleaned up old image cache: ${sessionPath}`);
      } catch {
      }
    }
    try {
      const remaining = await fsImpl.readdir(baseDir);
      if (remaining.length === 0) {
        await fsImpl.rmdir(baseDir);
      }
    } catch {
    }
  } catch {
  }
}
export {
  cacheImagePath,
  cleanupOldImageCaches,
  clearStoredImagePaths,
  getStoredImagePath,
  storeImage,
  storeImages
};
