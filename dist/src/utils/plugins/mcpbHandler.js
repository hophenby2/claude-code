import axios from "axios";
import { createHash } from "crypto";
import { chmod, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { logForDebugging } from "../debug.js";
import { parseAndValidateManifestFromBytes } from "../dxt/helpers.js";
import { parseZipModes, unzipFile } from "../dxt/zip.js";
import { errorMessage, getErrnoCode, isENOENT, toError } from "../errors.js";
import { getFsImplementation } from "../fsOperations.js";
import { logError } from "../log.js";
import { getSecureStorage } from "../secureStorage/index.js";
import {
  getSettings_DEPRECATED,
  updateSettingsForSource
} from "../settings/settings.js";
import { jsonParse, jsonStringify } from "../slowOperations.js";
import { getSystemDirectories } from "../systemDirectories.js";
import { classifyFetchError, logPluginFetch } from "./fetchTelemetry.js";
function isMcpbSource(source) {
  return source.endsWith(".mcpb") || source.endsWith(".dxt");
}
function isUrl(source) {
  return source.startsWith("http://") || source.startsWith("https://");
}
function generateContentHash(data) {
  return createHash("sha256").update(data).digest("hex").substring(0, 16);
}
function getMcpbCacheDir(pluginPath) {
  return join(pluginPath, ".mcpb-cache");
}
function getMetadataPath(cacheDir, source) {
  const sourceHash = createHash("md5").update(source).digest("hex").substring(0, 8);
  return join(cacheDir, `${sourceHash}.metadata.json`);
}
function serverSecretsKey(pluginId, serverName) {
  return `${pluginId}/${serverName}`;
}
function loadMcpServerUserConfig(pluginId, serverName) {
  try {
    const settings = getSettings_DEPRECATED();
    const nonSensitive = settings.pluginConfigs?.[pluginId]?.mcpServers?.[serverName];
    const sensitive = getSecureStorage().read()?.pluginSecrets?.[serverSecretsKey(pluginId, serverName)];
    if (!nonSensitive && !sensitive) {
      return null;
    }
    logForDebugging(
      `Loaded user config for ${pluginId}/${serverName} (settings + secureStorage)`
    );
    return { ...nonSensitive, ...sensitive };
  } catch (error) {
    const errorObj = toError(error);
    logError(errorObj);
    logForDebugging(
      `Failed to load user config for ${pluginId}/${serverName}: ${error}`,
      { level: "error" }
    );
    return null;
  }
}
function saveMcpServerUserConfig(pluginId, serverName, config, schema) {
  try {
    const nonSensitive = {};
    const sensitive = {};
    for (const [key, value] of Object.entries(config)) {
      if (schema[key]?.sensitive === true) {
        sensitive[key] = String(value);
      } else {
        nonSensitive[key] = value;
      }
    }
    const sensitiveKeysInThisSave = new Set(Object.keys(sensitive));
    const nonSensitiveKeysInThisSave = new Set(Object.keys(nonSensitive));
    const storage = getSecureStorage();
    const k = serverSecretsKey(pluginId, serverName);
    const existingInSecureStorage = storage.read()?.pluginSecrets?.[k] ?? void 0;
    const secureScrubbed = existingInSecureStorage ? Object.fromEntries(
      Object.entries(existingInSecureStorage).filter(
        ([key]) => !nonSensitiveKeysInThisSave.has(key)
      )
    ) : void 0;
    const needSecureScrub = secureScrubbed && existingInSecureStorage && Object.keys(secureScrubbed).length !== Object.keys(existingInSecureStorage).length;
    if (Object.keys(sensitive).length > 0 || needSecureScrub) {
      const existing = storage.read() ?? {};
      if (!existing.pluginSecrets) {
        existing.pluginSecrets = {};
      }
      existing.pluginSecrets[k] = {
        ...secureScrubbed,
        ...sensitive
      };
      const result = storage.update(existing);
      if (!result.success) {
        throw new Error(
          `Failed to save sensitive config to secure storage for ${k}`
        );
      }
      if (result.warning) {
        logForDebugging(`Server secrets save warning: ${result.warning}`, {
          level: "warn"
        });
      }
      if (needSecureScrub) {
        logForDebugging(
          `saveMcpServerUserConfig: scrubbed ${Object.keys(existingInSecureStorage).length - Object.keys(secureScrubbed).length} stale non-sensitive key(s) from secureStorage for ${k}`
        );
      }
    }
    const settings = getSettings_DEPRECATED();
    const existingInSettings = settings.pluginConfigs?.[pluginId]?.mcpServers?.[serverName] ?? {};
    const keysToScrubFromSettings = Object.keys(existingInSettings).filter(
      (k2) => sensitiveKeysInThisSave.has(k2)
    );
    if (Object.keys(nonSensitive).length > 0 || keysToScrubFromSettings.length > 0) {
      if (!settings.pluginConfigs) {
        settings.pluginConfigs = {};
      }
      if (!settings.pluginConfigs[pluginId]) {
        settings.pluginConfigs[pluginId] = {};
      }
      if (!settings.pluginConfigs[pluginId].mcpServers) {
        settings.pluginConfigs[pluginId].mcpServers = {};
      }
      const scrubbed = Object.fromEntries(
        keysToScrubFromSettings.map((k2) => [k2, void 0])
      );
      settings.pluginConfigs[pluginId].mcpServers[serverName] = {
        ...nonSensitive,
        ...scrubbed
      };
      const result = updateSettingsForSource("userSettings", settings);
      if (result.error) {
        throw result.error;
      }
      if (keysToScrubFromSettings.length > 0) {
        logForDebugging(
          `saveMcpServerUserConfig: scrubbed ${keysToScrubFromSettings.length} plaintext sensitive key(s) from settings.json for ${pluginId}/${serverName}`
        );
      }
    }
    logForDebugging(
      `Saved user config for ${pluginId}/${serverName} (${Object.keys(nonSensitive).length} non-sensitive, ${Object.keys(sensitive).length} sensitive)`
    );
  } catch (error) {
    const errorObj = toError(error);
    logError(errorObj);
    throw new Error(
      `Failed to save user configuration for ${pluginId}/${serverName}: ${errorObj.message}`
    );
  }
}
function validateUserConfig(values, schema) {
  const errors = [];
  for (const [key, fieldSchema] of Object.entries(schema)) {
    const value = values[key];
    if (fieldSchema.required && (value === void 0 || value === "")) {
      errors.push(`${fieldSchema.title || key} is required but not provided`);
      continue;
    }
    if (value === void 0 || value === "") {
      continue;
    }
    if (fieldSchema.type === "string") {
      if (Array.isArray(value)) {
        if (!fieldSchema.multiple) {
          errors.push(
            `${fieldSchema.title || key} must be a string, not an array`
          );
        } else if (!value.every((v) => typeof v === "string")) {
          errors.push(`${fieldSchema.title || key} must be an array of strings`);
        }
      } else if (typeof value !== "string") {
        errors.push(`${fieldSchema.title || key} must be a string`);
      }
    } else if (fieldSchema.type === "number" && typeof value !== "number") {
      errors.push(`${fieldSchema.title || key} must be a number`);
    } else if (fieldSchema.type === "boolean" && typeof value !== "boolean") {
      errors.push(`${fieldSchema.title || key} must be a boolean`);
    } else if ((fieldSchema.type === "file" || fieldSchema.type === "directory") && typeof value !== "string") {
      errors.push(`${fieldSchema.title || key} must be a path string`);
    }
    if (fieldSchema.type === "number" && typeof value === "number") {
      if (fieldSchema.min !== void 0 && value < fieldSchema.min) {
        errors.push(
          `${fieldSchema.title || key} must be at least ${fieldSchema.min}`
        );
      }
      if (fieldSchema.max !== void 0 && value > fieldSchema.max) {
        errors.push(
          `${fieldSchema.title || key} must be at most ${fieldSchema.max}`
        );
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
async function generateMcpConfig(manifest, extractedPath, userConfig = {}) {
  const { getMcpConfigForManifest } = await import("@anthropic-ai/mcpb");
  const mcpConfig = await getMcpConfigForManifest({
    manifest,
    extensionPath: extractedPath,
    systemDirs: getSystemDirectories(),
    userConfig,
    pathSeparator: "/"
  });
  if (!mcpConfig) {
    const error = new Error(
      `Failed to generate MCP server configuration from manifest "${manifest.name}"`
    );
    logError(error);
    throw error;
  }
  return mcpConfig;
}
async function loadCacheMetadata(cacheDir, source) {
  const fs = getFsImplementation();
  const metadataPath = getMetadataPath(cacheDir, source);
  try {
    const content = await fs.readFile(metadataPath, { encoding: "utf-8" });
    return jsonParse(content);
  } catch (error) {
    const code = getErrnoCode(error);
    if (code === "ENOENT") return null;
    const errorObj = toError(error);
    logError(errorObj);
    logForDebugging(`Failed to load MCPB cache metadata: ${error}`, {
      level: "error"
    });
    return null;
  }
}
async function saveCacheMetadata(cacheDir, source, metadata) {
  const metadataPath = getMetadataPath(cacheDir, source);
  await getFsImplementation().mkdir(cacheDir);
  await writeFile(metadataPath, jsonStringify(metadata, null, 2), "utf-8");
}
async function downloadMcpb(url, destPath, onProgress) {
  logForDebugging(`Downloading MCPB from ${url}`);
  if (onProgress) {
    onProgress(`Downloading ${url}...`);
  }
  const started = performance.now();
  let fetchTelemetryFired = false;
  try {
    const response = await axios.get(url, {
      timeout: 12e4,
      // 2 minute timeout
      responseType: "arraybuffer",
      maxRedirects: 5,
      // Follow redirects (like curl -L)
      onDownloadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percent = Math.round(
            progressEvent.loaded / progressEvent.total * 100
          );
          onProgress(`Downloading... ${percent}%`);
        }
      }
    });
    const data = new Uint8Array(response.data);
    logPluginFetch("mcpb", url, "success", performance.now() - started);
    fetchTelemetryFired = true;
    await writeFile(destPath, Buffer.from(data));
    logForDebugging(`Downloaded ${data.length} bytes to ${destPath}`);
    if (onProgress) {
      onProgress("Download complete");
    }
    return data;
  } catch (error) {
    if (!fetchTelemetryFired) {
      logPluginFetch(
        "mcpb",
        url,
        "failure",
        performance.now() - started,
        classifyFetchError(error)
      );
    }
    const errorMsg = errorMessage(error);
    const fullError = new Error(
      `Failed to download MCPB file from ${url}: ${errorMsg}`
    );
    logError(fullError);
    throw fullError;
  }
}
async function extractMcpbContents(unzipped, extractPath, modes, onProgress) {
  if (onProgress) {
    onProgress("Extracting files...");
  }
  await getFsImplementation().mkdir(extractPath);
  let filesWritten = 0;
  const entries = Object.entries(unzipped).filter(([k]) => !k.endsWith("/"));
  const totalFiles = entries.length;
  for (const [filePath, fileData] of entries) {
    const fullPath = join(extractPath, filePath);
    const dir = dirname(fullPath);
    if (dir !== extractPath) {
      await getFsImplementation().mkdir(dir);
    }
    const isTextFile = filePath.endsWith(".json") || filePath.endsWith(".js") || filePath.endsWith(".ts") || filePath.endsWith(".txt") || filePath.endsWith(".md") || filePath.endsWith(".yml") || filePath.endsWith(".yaml");
    if (isTextFile) {
      const content = new TextDecoder().decode(fileData);
      await writeFile(fullPath, content, "utf-8");
    } else {
      await writeFile(fullPath, Buffer.from(fileData));
    }
    const mode = modes[filePath];
    if (mode && mode & 73) {
      await chmod(fullPath, mode & 511).catch(() => {
      });
    }
    filesWritten++;
    if (onProgress && filesWritten % 10 === 0) {
      onProgress(`Extracted ${filesWritten}/${totalFiles} files`);
    }
  }
  logForDebugging(`Extracted ${filesWritten} files to ${extractPath}`);
  if (onProgress) {
    onProgress(`Extraction complete (${filesWritten} files)`);
  }
}
async function checkMcpbChanged(source, pluginPath) {
  const fs = getFsImplementation();
  const cacheDir = getMcpbCacheDir(pluginPath);
  const metadata = await loadCacheMetadata(cacheDir, source);
  if (!metadata) {
    return true;
  }
  try {
    await fs.stat(metadata.extractedPath);
  } catch (error) {
    const code = getErrnoCode(error);
    if (code === "ENOENT") {
      logForDebugging(`MCPB extraction path missing: ${metadata.extractedPath}`);
    } else {
      logForDebugging(
        `MCPB extraction path inaccessible: ${metadata.extractedPath}: ${error}`,
        { level: "error" }
      );
    }
    return true;
  }
  if (!isUrl(source)) {
    const localPath = join(pluginPath, source);
    let stats;
    try {
      stats = await fs.stat(localPath);
    } catch (error) {
      const code = getErrnoCode(error);
      if (code === "ENOENT") {
        logForDebugging(`MCPB source file missing: ${localPath}`);
      } else {
        logForDebugging(
          `MCPB source file inaccessible: ${localPath}: ${error}`,
          { level: "error" }
        );
      }
      return true;
    }
    const cachedTime = new Date(metadata.cachedAt).getTime();
    const fileTime = Math.floor(stats.mtimeMs);
    if (fileTime > cachedTime) {
      logForDebugging(
        `MCPB file modified: ${new Date(fileTime)} > ${new Date(cachedTime)}`
      );
      return true;
    }
  }
  return false;
}
async function loadMcpbFile(source, pluginPath, pluginId, onProgress, providedUserConfig, forceConfigDialog) {
  const fs = getFsImplementation();
  const cacheDir = getMcpbCacheDir(pluginPath);
  await fs.mkdir(cacheDir);
  logForDebugging(`Loading MCPB from source: ${source}`);
  const metadata = await loadCacheMetadata(cacheDir, source);
  if (metadata && !await checkMcpbChanged(source, pluginPath)) {
    logForDebugging(
      `Using cached MCPB from ${metadata.extractedPath} (hash: ${metadata.contentHash})`
    );
    const manifestPath = join(metadata.extractedPath, "manifest.json");
    let manifestContent;
    try {
      manifestContent = await fs.readFile(manifestPath, { encoding: "utf-8" });
    } catch (error) {
      if (isENOENT(error)) {
        const err = new Error(`Cached manifest not found: ${manifestPath}`);
        logError(err);
        throw err;
      }
      throw error;
    }
    const manifestData2 = new TextEncoder().encode(manifestContent);
    const manifest2 = await parseAndValidateManifestFromBytes(manifestData2);
    if (manifest2.user_config && Object.keys(manifest2.user_config).length > 0) {
      const serverName = manifest2.name;
      const savedConfig = loadMcpServerUserConfig(pluginId, serverName);
      const userConfig = providedUserConfig || savedConfig || {};
      const validation = validateUserConfig(userConfig, manifest2.user_config);
      if (forceConfigDialog || !validation.valid) {
        return {
          status: "needs-config",
          manifest: manifest2,
          extractedPath: metadata.extractedPath,
          contentHash: metadata.contentHash,
          configSchema: manifest2.user_config,
          existingConfig: savedConfig || {},
          validationErrors: validation.valid ? [] : validation.errors
        };
      }
      if (providedUserConfig) {
        saveMcpServerUserConfig(
          pluginId,
          serverName,
          providedUserConfig,
          manifest2.user_config ?? {}
        );
      }
      const mcpConfig3 = await generateMcpConfig(
        manifest2,
        metadata.extractedPath,
        userConfig
      );
      return {
        manifest: manifest2,
        mcpConfig: mcpConfig3,
        extractedPath: metadata.extractedPath,
        contentHash: metadata.contentHash
      };
    }
    const mcpConfig2 = await generateMcpConfig(manifest2, metadata.extractedPath);
    return {
      manifest: manifest2,
      mcpConfig: mcpConfig2,
      extractedPath: metadata.extractedPath,
      contentHash: metadata.contentHash
    };
  }
  let mcpbData;
  let mcpbFilePath;
  if (isUrl(source)) {
    const sourceHash = createHash("md5").update(source).digest("hex").substring(0, 8);
    mcpbFilePath = join(cacheDir, `${sourceHash}.mcpb`);
    mcpbData = await downloadMcpb(source, mcpbFilePath, onProgress);
  } else {
    const localPath = join(pluginPath, source);
    if (onProgress) {
      onProgress(`Loading ${source}...`);
    }
    try {
      mcpbData = await fs.readFileBytes(localPath);
      mcpbFilePath = localPath;
    } catch (error) {
      if (isENOENT(error)) {
        const err = new Error(`MCPB file not found: ${localPath}`);
        logError(err);
        throw err;
      }
      throw error;
    }
  }
  const contentHash = generateContentHash(mcpbData);
  logForDebugging(`MCPB content hash: ${contentHash}`);
  if (onProgress) {
    onProgress("Extracting MCPB archive...");
  }
  const unzipped = await unzipFile(Buffer.from(mcpbData));
  const modes = parseZipModes(mcpbData);
  const manifestData = unzipped["manifest.json"];
  if (!manifestData) {
    const error = new Error("No manifest.json found in MCPB file");
    logError(error);
    throw error;
  }
  const manifest = await parseAndValidateManifestFromBytes(manifestData);
  logForDebugging(
    `MCPB manifest: ${manifest.name} v${manifest.version} by ${manifest.author.name}`
  );
  if (!manifest.server) {
    const error = new Error(
      `MCPB manifest for "${manifest.name}" does not define a server configuration`
    );
    logError(error);
    throw error;
  }
  const extractPath = join(cacheDir, contentHash);
  await extractMcpbContents(unzipped, extractPath, modes, onProgress);
  if (manifest.user_config && Object.keys(manifest.user_config).length > 0) {
    const serverName = manifest.name;
    const savedConfig = loadMcpServerUserConfig(pluginId, serverName);
    const userConfig = providedUserConfig || savedConfig || {};
    const validation = validateUserConfig(userConfig, manifest.user_config);
    if (!validation.valid) {
      const newMetadata3 = {
        source,
        contentHash,
        extractedPath: extractPath,
        cachedAt: (/* @__PURE__ */ new Date()).toISOString(),
        lastChecked: (/* @__PURE__ */ new Date()).toISOString()
      };
      await saveCacheMetadata(cacheDir, source, newMetadata3);
      return {
        status: "needs-config",
        manifest,
        extractedPath: extractPath,
        contentHash,
        configSchema: manifest.user_config,
        existingConfig: savedConfig || {},
        validationErrors: validation.errors
      };
    }
    if (providedUserConfig) {
      saveMcpServerUserConfig(
        pluginId,
        serverName,
        providedUserConfig,
        manifest.user_config ?? {}
      );
    }
    if (onProgress) {
      onProgress("Generating MCP server configuration...");
    }
    const mcpConfig2 = await generateMcpConfig(manifest, extractPath, userConfig);
    const newMetadata2 = {
      source,
      contentHash,
      extractedPath: extractPath,
      cachedAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastChecked: (/* @__PURE__ */ new Date()).toISOString()
    };
    await saveCacheMetadata(cacheDir, source, newMetadata2);
    return {
      manifest,
      mcpConfig: mcpConfig2,
      extractedPath: extractPath,
      contentHash
    };
  }
  if (onProgress) {
    onProgress("Generating MCP server configuration...");
  }
  const mcpConfig = await generateMcpConfig(manifest, extractPath);
  const newMetadata = {
    source,
    contentHash,
    extractedPath: extractPath,
    cachedAt: (/* @__PURE__ */ new Date()).toISOString(),
    lastChecked: (/* @__PURE__ */ new Date()).toISOString()
  };
  await saveCacheMetadata(cacheDir, source, newMetadata);
  logForDebugging(
    `Successfully loaded MCPB: ${manifest.name} (extracted to ${extractPath})`
  );
  return {
    manifest,
    mcpConfig,
    extractedPath: extractPath,
    contentHash
  };
}
export {
  checkMcpbChanged,
  isMcpbSource,
  loadMcpServerUserConfig,
  loadMcpbFile,
  saveMcpServerUserConfig,
  validateUserConfig
};
