import axios from "axios";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "fs/promises";
import { dirname, join, resolve, sep } from "path";
import { waitForScrollIdle } from "../../bootstrap/state.js";
import { logEvent } from "../../services/analytics/index.js";
import { logForDebugging } from "../debug.js";
import { parseZipModes, unzipFile } from "../dxt/zip.js";
import { errorMessage, getErrnoCode } from "../errors.js";
const GCS_BASE = "https://downloads.claude.ai/claude-code-releases/plugins/claude-plugins-official";
const ARC_PREFIX = "marketplaces/claude-plugins-official/";
async function fetchOfficialMarketplaceFromGcs(installLocation, marketplacesCacheDir) {
  const cacheDir = resolve(marketplacesCacheDir);
  const resolvedLoc = resolve(installLocation);
  if (resolvedLoc !== cacheDir && !resolvedLoc.startsWith(cacheDir + sep)) {
    logForDebugging(
      `fetchOfficialMarketplaceFromGcs: refusing path outside cache dir: ${installLocation}`,
      { level: "error" }
    );
    return null;
  }
  await waitForScrollIdle();
  const start = performance.now();
  let outcome = "failed";
  let sha;
  let bytes;
  let errKind;
  try {
    const latest = await axios.get(`${GCS_BASE}/latest`, {
      responseType: "text",
      timeout: 1e4
    });
    sha = String(latest.data).trim();
    if (!sha) {
      throw new Error("latest pointer returned empty body");
    }
    const sentinelPath = join(installLocation, ".gcs-sha");
    const currentSha = await readFile(sentinelPath, "utf8").then(
      (s) => s.trim(),
      () => null
      // ENOENT — first fetch, proceed to download
    );
    if (currentSha === sha) {
      outcome = "noop";
      return sha;
    }
    const zipResp = await axios.get(`${GCS_BASE}/${sha}.zip`, {
      responseType: "arraybuffer",
      timeout: 6e4
    });
    const zipBuf = Buffer.from(zipResp.data);
    bytes = zipBuf.length;
    const files = await unzipFile(zipBuf);
    const modes = parseZipModes(zipBuf);
    const staging = `${installLocation}.staging`;
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging, { recursive: true });
    for (const [arcPath, data] of Object.entries(files)) {
      if (!arcPath.startsWith(ARC_PREFIX)) continue;
      const rel = arcPath.slice(ARC_PREFIX.length);
      if (!rel || rel.endsWith("/")) continue;
      const dest = join(staging, rel);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, data);
      const mode = modes[arcPath];
      if (mode && mode & 73) {
        await chmod(dest, mode & 511).catch(() => {
        });
      }
    }
    await writeFile(join(staging, ".gcs-sha"), sha);
    await rm(installLocation, { recursive: true, force: true });
    await rename(staging, installLocation);
    outcome = "updated";
    return sha;
  } catch (e) {
    errKind = classifyGcsError(e);
    logForDebugging(
      `Official marketplace GCS fetch failed: ${errorMessage(e)}`,
      { level: "warn" }
    );
    return null;
  } finally {
    logEvent("tengu_plugin_remote_fetch", {
      source: "marketplace_gcs",
      host: "downloads.claude.ai",
      is_official: true,
      outcome,
      duration_ms: Math.round(performance.now() - start),
      ...bytes !== void 0 && { bytes },
      ...sha && { sha },
      ...errKind && { error_kind: errKind }
    });
  }
}
const KNOWN_FS_CODES = /* @__PURE__ */ new Set([
  "ENOSPC",
  "EACCES",
  "EPERM",
  "EXDEV",
  "EBUSY",
  "ENOENT",
  "ENOTDIR",
  "EROFS",
  "EMFILE",
  "ENAMETOOLONG"
]);
function classifyGcsError(e) {
  if (axios.isAxiosError(e)) {
    if (e.code === "ECONNABORTED") return "timeout";
    if (e.response) return `http_${e.response.status}`;
    return "network";
  }
  const code = getErrnoCode(e);
  if (code && /^E[A-Z]+$/.test(code) && !code.startsWith("ERR_")) {
    return KNOWN_FS_CODES.has(code) ? `fs_${code}` : "fs_other";
  }
  if (typeof e?.code === "number") return "zip_parse";
  const msg = errorMessage(e);
  if (/unzip|invalid zip|central directory/i.test(msg)) return "zip_parse";
  if (/empty body/.test(msg)) return "empty_latest";
  return "other";
}
export {
  classifyGcsError,
  fetchOfficialMarketplaceFromGcs
};
