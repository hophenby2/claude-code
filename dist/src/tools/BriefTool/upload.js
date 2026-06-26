const feature = (_name) => false;
import "axios";
import "crypto";
import "fs/promises";
import { extname } from "path";
import { z } from "zod/v4";
import {
  getBridgeBaseUrlOverride
} from "../../bridge/bridgeConfig.js";
import { getOauthConfig } from "../../constants/oauth.js";
import { logForDebugging } from "../../utils/debug.js";
import { lazySchema } from "../../utils/lazySchema.js";
import "../../utils/slowOperations.js";
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 3e4;
const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp"
};
function guessMimeType(filename) {
  const ext = extname(filename).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}
function debug(msg) {
  logForDebugging(`[brief:upload] ${msg}`);
}
function getBridgeBaseUrl() {
  return getBridgeBaseUrlOverride() ?? process.env.ANTHROPIC_BASE_URL ?? getOauthConfig().BASE_API_URL;
}
const uploadResponseSchema = lazySchema(
  () => z.object({ file_uuid: z.string() })
);
async function uploadBriefAttachment(fullPath, size, ctx) {
  if (false) {
    if (!ctx.replBridgeEnabled) return void 0;
    if (size > MAX_UPLOAD_BYTES) {
      debug(`skip ${fullPath}: ${size} bytes exceeds ${MAX_UPLOAD_BYTES} limit`);
      return void 0;
    }
    const token = getBridgeAccessToken();
    if (!token) {
      debug("skip: no oauth token");
      return void 0;
    }
    let content;
    try {
      content = await readFile(fullPath);
    } catch (e) {
      debug(`read failed for ${fullPath}: ${e}`);
      return void 0;
    }
    const baseUrl = getBridgeBaseUrl();
    const url = `${baseUrl}/api/oauth/file_upload`;
    const filename = basename(fullPath);
    const mimeType = guessMimeType(filename);
    const boundary = `----FormBoundary${randomUUID()}`;
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r
Content-Disposition: form-data; name="file"; filename="${filename}"\r
Content-Type: ${mimeType}\r
\r
`
      ),
      content,
      Buffer.from(`\r
--${boundary}--\r
`)
    ]);
    try {
      const response = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length.toString()
        },
        timeout: UPLOAD_TIMEOUT_MS,
        signal: ctx.signal,
        validateStatus: () => true
      });
      if (response.status !== 201) {
        debug(
          `upload failed for ${fullPath}: status=${response.status} body=${jsonStringify(response.data).slice(0, 200)}`
        );
        return void 0;
      }
      const parsed = uploadResponseSchema().safeParse(response.data);
      if (!parsed.success) {
        debug(
          `unexpected response shape for ${fullPath}: ${parsed.error.message}`
        );
        return void 0;
      }
      debug(`uploaded ${fullPath} \u2192 ${parsed.data.file_uuid} (${size} bytes)`);
      return parsed.data.file_uuid;
    } catch (e) {
      debug(`upload threw for ${fullPath}: ${e}`);
      return void 0;
    }
  }
  return void 0;
}
export {
  uploadBriefAttachment
};
