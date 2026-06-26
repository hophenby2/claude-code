const feature = (_name) => false;
import { stat } from "fs/promises";
import { getCwd } from "../../utils/cwd.js";
import "../../utils/envUtils.js";
import { getErrnoCode } from "../../utils/errors.js";
import { IMAGE_EXTENSION_REGEX } from "../../utils/imagePaste.js";
import { expandPath } from "../../utils/path.js";
async function validateAttachmentPaths(rawPaths) {
  const cwd = getCwd();
  for (const rawPath of rawPaths) {
    const fullPath = expandPath(rawPath);
    try {
      const stats = await stat(fullPath);
      if (!stats.isFile()) {
        return {
          result: false,
          message: `Attachment "${rawPath}" is not a regular file.`,
          errorCode: 1
        };
      }
    } catch (e) {
      const code = getErrnoCode(e);
      if (code === "ENOENT") {
        return {
          result: false,
          message: `Attachment "${rawPath}" does not exist. Current working directory: ${cwd}.`,
          errorCode: 1
        };
      }
      if (code === "EACCES" || code === "EPERM") {
        return {
          result: false,
          message: `Attachment "${rawPath}" is not accessible (permission denied).`,
          errorCode: 1
        };
      }
      throw e;
    }
  }
  return { result: true };
}
async function resolveAttachments(rawPaths, uploadCtx) {
  const stated = [];
  for (const rawPath of rawPaths) {
    const fullPath = expandPath(rawPath);
    const stats = await stat(fullPath);
    stated.push({
      path: fullPath,
      size: stats.size,
      isImage: IMAGE_EXTENSION_REGEX.test(fullPath)
    });
  }
  if (false) {
    const shouldUpload = uploadCtx.replBridgeEnabled || isEnvTruthy(process.env.CLAUDE_CODE_BRIEF_UPLOAD);
    const { uploadBriefAttachment } = await null;
    const uuids = await Promise.all(
      stated.map(
        (a) => uploadBriefAttachment(a.path, a.size, {
          replBridgeEnabled: shouldUpload,
          signal: uploadCtx.signal
        })
      )
    );
    return stated.map(
      (a, i) => uuids[i] === void 0 ? a : { ...a, file_uuid: uuids[i] }
    );
  }
  return stated;
}
export {
  resolveAttachments,
  validateAttachmentPaths
};
