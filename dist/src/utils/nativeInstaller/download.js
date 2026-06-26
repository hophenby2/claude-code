const feature = (_name) => false;
import axios from "axios";
import { createHash } from "crypto";
import { chmod, writeFile } from "fs/promises";
import { join } from "path";
import { logEvent } from "../../services/analytics/index.js";
import { logForDebugging } from "../debug.js";
import { toError } from "../errors.js";
import { execFileNoThrowWithCwd } from "../execFileNoThrow.js";
import { getFsImplementation } from "../fsOperations.js";
import { logError } from "../log.js";
import { sleep } from "../sleep.js";
import { jsonStringify, writeFileSync_DEPRECATED } from "../slowOperations.js";
import { getBinaryName, getPlatform } from "./installer.js";
const GCS_BUCKET_URL = "https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases";
const ARTIFACTORY_REGISTRY_URL = "https://artifactory.infra.ant.dev/artifactory/api/npm/npm-all/";
async function getLatestVersionFromArtifactory(tag = "latest") {
  const startTime = Date.now();
  const { stdout, code, stderr } = await execFileNoThrowWithCwd(
    "npm",
    [
      "view",
      `${"claude-code-reconstructed-native"}@${tag}`,
      "version",
      "--prefer-online",
      "--registry",
      ARTIFACTORY_REGISTRY_URL
    ],
    {
      timeout: 3e4,
      preserveOutputOnError: true
    }
  );
  const latencyMs = Date.now() - startTime;
  if (code !== 0) {
    logEvent("tengu_version_check_failure", {
      latency_ms: latencyMs,
      source_npm: true,
      exit_code: code
    });
    const error = new Error(`npm view failed with code ${code}: ${stderr}`);
    logError(error);
    throw error;
  }
  logEvent("tengu_version_check_success", {
    latency_ms: latencyMs,
    source_npm: true
  });
  logForDebugging(
    `npm view ${"claude-code-reconstructed-native"}@${tag} version: ${stdout}`
  );
  const latestVersion = stdout.trim();
  return latestVersion;
}
async function getLatestVersionFromBinaryRepo(channel = "latest", baseUrl, authConfig) {
  const startTime = Date.now();
  try {
    const response = await axios.get(`${baseUrl}/${channel}`, {
      timeout: 3e4,
      responseType: "text",
      ...authConfig
    });
    const latencyMs = Date.now() - startTime;
    logEvent("tengu_version_check_success", {
      latency_ms: latencyMs
    });
    return response.data.trim();
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    let httpStatus;
    if (axios.isAxiosError(error) && error.response) {
      httpStatus = error.response.status;
    }
    logEvent("tengu_version_check_failure", {
      latency_ms: latencyMs,
      http_status: httpStatus,
      is_timeout: errorMessage.includes("timeout")
    });
    const fetchError = new Error(
      `Failed to fetch version from ${baseUrl}/${channel}: ${errorMessage}`
    );
    logError(fetchError);
    throw fetchError;
  }
}
async function getLatestVersion(channelOrVersion) {
  if (/^v?\d+\.\d+\.\d+(-\S+)?$/.test(channelOrVersion)) {
    const normalized = channelOrVersion.startsWith("v") ? channelOrVersion.slice(1) : channelOrVersion;
    if (/^99\.99\./.test(normalized) && true) {
      throw new Error(
        `Version ${normalized} is not available for installation. Use 'stable' or 'latest'.`
      );
    }
    return normalized;
  }
  const channel = channelOrVersion;
  if (channel !== "stable" && channel !== "latest") {
    throw new Error(
      `Invalid channel: ${channelOrVersion}. Use 'stable' or 'latest'`
    );
  }
  if (process.env.USER_TYPE === "ant") {
    const npmTag = channel === "stable" ? "stable" : "latest";
    return getLatestVersionFromArtifactory(npmTag);
  }
  return getLatestVersionFromBinaryRepo(channel, GCS_BUCKET_URL);
}
async function downloadVersionFromArtifactory(version, stagingPath) {
  const fs = getFsImplementation();
  await fs.rm(stagingPath, { recursive: true, force: true });
  const platform = getPlatform();
  const platformPackageName = `${"claude-code-reconstructed-native"}-${platform}`;
  logForDebugging(
    `Fetching integrity hash for ${platformPackageName}@${version}`
  );
  const {
    stdout: integrityOutput,
    code,
    stderr
  } = await execFileNoThrowWithCwd(
    "npm",
    [
      "view",
      `${platformPackageName}@${version}`,
      "dist.integrity",
      "--registry",
      ARTIFACTORY_REGISTRY_URL
    ],
    {
      timeout: 3e4,
      preserveOutputOnError: true
    }
  );
  if (code !== 0) {
    throw new Error(`npm view integrity failed with code ${code}: ${stderr}`);
  }
  const integrity = integrityOutput.trim();
  if (!integrity) {
    throw new Error(
      `Failed to fetch integrity hash for ${platformPackageName}@${version}`
    );
  }
  logForDebugging(`Got integrity hash for ${platform}: ${integrity}`);
  await fs.mkdir(stagingPath);
  const packageJson = {
    name: "claude-native-installer",
    version: "0.0.1",
    dependencies: {
      ["claude-code-reconstructed-native"]: version
    }
  };
  const packageLock = {
    name: "claude-native-installer",
    version: "0.0.1",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": {
        name: "claude-native-installer",
        version: "0.0.1",
        dependencies: {
          ["claude-code-reconstructed-native"]: version
        }
      },
      [`node_modules/${"claude-code-reconstructed-native"}`]: {
        version,
        optionalDependencies: {
          [platformPackageName]: version
        }
      },
      [`node_modules/${platformPackageName}`]: {
        version,
        integrity
      }
    }
  };
  writeFileSync_DEPRECATED(
    join(stagingPath, "package.json"),
    jsonStringify(packageJson, null, 2),
    { encoding: "utf8", flush: true }
  );
  writeFileSync_DEPRECATED(
    join(stagingPath, "package-lock.json"),
    jsonStringify(packageLock, null, 2),
    { encoding: "utf8", flush: true }
  );
  const result = await execFileNoThrowWithCwd(
    "npm",
    ["ci", "--prefer-online", "--registry", ARTIFACTORY_REGISTRY_URL],
    {
      timeout: 6e4,
      preserveOutputOnError: true,
      cwd: stagingPath
    }
  );
  if (result.code !== 0) {
    throw new Error(`npm ci failed with code ${result.code}: ${result.stderr}`);
  }
  logForDebugging(
    `Successfully downloaded and verified ${"claude-code-reconstructed-native"}@${version}`
  );
}
const DEFAULT_STALL_TIMEOUT_MS = 6e4;
const MAX_DOWNLOAD_RETRIES = 3;
function getStallTimeoutMs() {
  return Number(process.env.CLAUDE_CODE_STALL_TIMEOUT_MS_FOR_TESTING) || DEFAULT_STALL_TIMEOUT_MS;
}
class StallTimeoutError extends Error {
  constructor() {
    super("Download stalled: no data received for 60 seconds");
    this.name = "StallTimeoutError";
  }
}
async function downloadAndVerifyBinary(binaryUrl, expectedChecksum, binaryPath, requestConfig = {}) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_DOWNLOAD_RETRIES; attempt++) {
    const controller = new AbortController();
    let stallTimer;
    const clearStallTimer = () => {
      if (stallTimer) {
        clearTimeout(stallTimer);
        stallTimer = void 0;
      }
    };
    const resetStallTimer = () => {
      clearStallTimer();
      stallTimer = setTimeout((c) => c.abort(), getStallTimeoutMs(), controller);
    };
    try {
      resetStallTimer();
      const response = await axios.get(binaryUrl, {
        timeout: 5 * 6e4,
        // 5 minute total timeout
        responseType: "arraybuffer",
        signal: controller.signal,
        onDownloadProgress: () => {
          resetStallTimer();
        },
        ...requestConfig
      });
      clearStallTimer();
      const hash = createHash("sha256");
      hash.update(response.data);
      const actualChecksum = hash.digest("hex");
      if (actualChecksum !== expectedChecksum) {
        throw new Error(
          `Checksum mismatch: expected ${expectedChecksum}, got ${actualChecksum}`
        );
      }
      await writeFile(binaryPath, Buffer.from(response.data));
      await chmod(binaryPath, 493);
      return;
    } catch (error) {
      clearStallTimer();
      const isStallTimeout = axios.isCancel(error);
      if (isStallTimeout) {
        lastError = new StallTimeoutError();
      } else {
        lastError = toError(error);
      }
      if (isStallTimeout && attempt < MAX_DOWNLOAD_RETRIES) {
        logForDebugging(
          `Download stalled on attempt ${attempt}/${MAX_DOWNLOAD_RETRIES}, retrying...`
        );
        await sleep(1e3);
        continue;
      }
      throw lastError;
    }
  }
  throw lastError ?? new Error("Download failed after all retries");
}
async function downloadVersionFromBinaryRepo(version, stagingPath, baseUrl, authConfig) {
  const fs = getFsImplementation();
  await fs.rm(stagingPath, { recursive: true, force: true });
  const platform = getPlatform();
  const startTime = Date.now();
  logEvent("tengu_binary_download_attempt", {});
  let manifest;
  try {
    const manifestResponse = await axios.get(
      `${baseUrl}/${version}/manifest.json`,
      {
        timeout: 1e4,
        responseType: "json",
        ...authConfig
      }
    );
    manifest = manifestResponse.data;
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    let httpStatus;
    if (axios.isAxiosError(error) && error.response) {
      httpStatus = error.response.status;
    }
    logEvent("tengu_binary_manifest_fetch_failure", {
      latency_ms: latencyMs,
      http_status: httpStatus,
      is_timeout: errorMessage.includes("timeout")
    });
    logError(
      new Error(
        `Failed to fetch manifest from ${baseUrl}/${version}/manifest.json: ${errorMessage}`
      )
    );
    throw error;
  }
  const platformInfo = manifest.platforms[platform];
  if (!platformInfo) {
    logEvent("tengu_binary_platform_not_found", {});
    throw new Error(
      `Platform ${platform} not found in manifest for version ${version}`
    );
  }
  const expectedChecksum = platformInfo.checksum;
  const binaryName = getBinaryName(platform);
  const binaryUrl = `${baseUrl}/${version}/${platform}/${binaryName}`;
  await fs.mkdir(stagingPath);
  const binaryPath = join(stagingPath, binaryName);
  try {
    await downloadAndVerifyBinary(
      binaryUrl,
      expectedChecksum,
      binaryPath,
      authConfig || {}
    );
    const latencyMs = Date.now() - startTime;
    logEvent("tengu_binary_download_success", {
      latency_ms: latencyMs
    });
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    let httpStatus;
    if (axios.isAxiosError(error) && error.response) {
      httpStatus = error.response.status;
    }
    logEvent("tengu_binary_download_failure", {
      latency_ms: latencyMs,
      http_status: httpStatus,
      is_timeout: errorMessage.includes("timeout"),
      is_checksum_mismatch: errorMessage.includes("Checksum mismatch")
    });
    logError(
      new Error(`Failed to download binary from ${binaryUrl}: ${errorMessage}`)
    );
    throw error;
  }
}
async function downloadVersion(version, stagingPath) {
  if (false) {
    const { stdout } = await execFileNoThrowWithCwd("gcloud", [
      "auth",
      "print-access-token"
    ]);
    await downloadVersionFromBinaryRepo(
      version,
      stagingPath,
      "https://storage.googleapis.com/claude-code-ci-sentinel",
      { headers: { Authorization: `Bearer ${stdout.trim()}` } }
    );
    return "binary";
  }
  if (process.env.USER_TYPE === "ant") {
    await downloadVersionFromArtifactory(version, stagingPath);
    return "npm";
  }
  await downloadVersionFromBinaryRepo(version, stagingPath, GCS_BUCKET_URL);
  return "binary";
}
const STALL_TIMEOUT_MS = DEFAULT_STALL_TIMEOUT_MS;
const _downloadAndVerifyBinaryForTesting = downloadAndVerifyBinary;
export {
  ARTIFACTORY_REGISTRY_URL,
  MAX_DOWNLOAD_RETRIES,
  STALL_TIMEOUT_MS,
  StallTimeoutError,
  _downloadAndVerifyBinaryForTesting,
  downloadVersion,
  downloadVersionFromArtifactory,
  downloadVersionFromBinaryRepo,
  getLatestVersion,
  getLatestVersionFromArtifactory,
  getLatestVersionFromBinaryRepo
};
