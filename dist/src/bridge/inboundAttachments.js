import axios from "axios";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { basename, join } from "path";
import { z } from "zod/v4";
import { getSessionId } from "../bootstrap/state.js";
import { logForDebugging } from "../utils/debug.js";
import { getClaudeConfigHomeDir } from "../utils/envUtils.js";
import { lazySchema } from "../utils/lazySchema.js";
import { getBridgeAccessToken, getBridgeBaseUrl } from "./bridgeConfig.js";
const DOWNLOAD_TIMEOUT_MS = 3e4;
function debug(msg) {
  logForDebugging(`[bridge:inbound-attach] ${msg}`);
}
const attachmentSchema = lazySchema(
  () => z.object({
    file_uuid: z.string(),
    file_name: z.string()
  })
);
const attachmentsArraySchema = lazySchema(() => z.array(attachmentSchema()));
function extractInboundAttachments(msg) {
  if (typeof msg !== "object" || msg === null || !("file_attachments" in msg)) {
    return [];
  }
  const parsed = attachmentsArraySchema().safeParse(msg.file_attachments);
  return parsed.success ? parsed.data : [];
}
function sanitizeFileName(name) {
  const base = basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base || "attachment";
}
function uploadsDir() {
  return join(getClaudeConfigHomeDir(), "uploads", getSessionId());
}
async function resolveOne(att) {
  const token = getBridgeAccessToken();
  if (!token) {
    debug("skip: no oauth token");
    return void 0;
  }
  let data;
  try {
    const url = `${getBridgeBaseUrl()}/api/oauth/files/${encodeURIComponent(att.file_uuid)}/content`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: "arraybuffer",
      timeout: DOWNLOAD_TIMEOUT_MS,
      validateStatus: () => true
    });
    if (response.status !== 200) {
      debug(`fetch ${att.file_uuid} failed: status=${response.status}`);
      return void 0;
    }
    data = Buffer.from(response.data);
  } catch (e) {
    debug(`fetch ${att.file_uuid} threw: ${e}`);
    return void 0;
  }
  const safeName = sanitizeFileName(att.file_name);
  const prefix = (att.file_uuid.slice(0, 8) || randomUUID().slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, "_");
  const dir = uploadsDir();
  const outPath = join(dir, `${prefix}-${safeName}`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(outPath, data);
  } catch (e) {
    debug(`write ${outPath} failed: ${e}`);
    return void 0;
  }
  debug(`resolved ${att.file_uuid} \u2192 ${outPath} (${data.length} bytes)`);
  return outPath;
}
async function resolveInboundAttachments(attachments) {
  if (attachments.length === 0) return "";
  debug(`resolving ${attachments.length} attachment(s)`);
  const paths = await Promise.all(attachments.map(resolveOne));
  const ok = paths.filter((p) => p !== void 0);
  if (ok.length === 0) return "";
  return ok.map((p) => `@"${p}"`).join(" ") + " ";
}
function prependPathRefs(content, prefix) {
  if (!prefix) return content;
  if (typeof content === "string") return prefix + content;
  const i = content.findLastIndex((b) => b.type === "text");
  if (i !== -1) {
    const b = content[i];
    if (b.type === "text") {
      return [
        ...content.slice(0, i),
        { ...b, text: prefix + b.text },
        ...content.slice(i + 1)
      ];
    }
  }
  return [...content, { type: "text", text: prefix.trimEnd() }];
}
async function resolveAndPrepend(msg, content) {
  const attachments = extractInboundAttachments(msg);
  if (attachments.length === 0) return content;
  const prefix = await resolveInboundAttachments(attachments);
  return prependPathRefs(content, prefix);
}
export {
  extractInboundAttachments,
  prependPathRefs,
  resolveAndPrepend,
  resolveInboundAttachments
};
