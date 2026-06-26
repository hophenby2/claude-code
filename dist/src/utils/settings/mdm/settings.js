import { join } from "path";
import { logForDebugging } from "../../debug.js";
import { logForDiagnosticsNoPII } from "../../diagLogs.js";
import { readFileSync } from "../../fileRead.js";
import { getFsImplementation } from "../../fsOperations.js";
import { safeParseJSON } from "../../json.js";
import { profileCheckpoint } from "../../startupProfiler.js";
import {
  getManagedFilePath,
  getManagedSettingsDropInDir
} from "../managedPath.js";
import { SettingsSchema } from "../types.js";
import {
  filterInvalidPermissionRules,
  formatZodError
} from "../validation.js";
import {
  WINDOWS_REGISTRY_KEY_PATH_HKCU,
  WINDOWS_REGISTRY_KEY_PATH_HKLM,
  WINDOWS_REGISTRY_VALUE_NAME
} from "./constants.js";
import {
  fireRawRead,
  getMdmRawReadPromise
} from "./rawRead.js";
const EMPTY_RESULT = Object.freeze({ settings: {}, errors: [] });
let mdmCache = null;
let hkcuCache = null;
let mdmLoadPromise = null;
function startMdmSettingsLoad() {
  if (mdmLoadPromise) return;
  mdmLoadPromise = (async () => {
    profileCheckpoint("mdm_load_start");
    const startTime = Date.now();
    const rawPromise = getMdmRawReadPromise() ?? fireRawRead();
    const { mdm, hkcu } = consumeRawReadResult(await rawPromise);
    mdmCache = mdm;
    hkcuCache = hkcu;
    profileCheckpoint("mdm_load_end");
    const duration = Date.now() - startTime;
    logForDebugging(`MDM settings load completed in ${duration}ms`);
    if (Object.keys(mdm.settings).length > 0) {
      logForDebugging(
        `MDM settings found: ${Object.keys(mdm.settings).join(", ")}`
      );
      try {
        logForDiagnosticsNoPII("info", "mdm_settings_loaded", {
          duration_ms: duration,
          key_count: Object.keys(mdm.settings).length,
          error_count: mdm.errors.length
        });
      } catch {
      }
    }
  })();
}
async function ensureMdmSettingsLoaded() {
  if (!mdmLoadPromise) {
    startMdmSettingsLoad();
  }
  await mdmLoadPromise;
}
function getMdmSettings() {
  return mdmCache ?? EMPTY_RESULT;
}
function getHkcuSettings() {
  return hkcuCache ?? EMPTY_RESULT;
}
function clearMdmSettingsCache() {
  mdmCache = null;
  hkcuCache = null;
  mdmLoadPromise = null;
}
function setMdmSettingsCache(mdm, hkcu) {
  mdmCache = mdm;
  hkcuCache = hkcu;
}
async function refreshMdmSettings() {
  const raw = await fireRawRead();
  return consumeRawReadResult(raw);
}
function parseCommandOutputAsSettings(stdout, sourcePath) {
  const data = safeParseJSON(stdout, false);
  if (!data || typeof data !== "object") {
    return { settings: {}, errors: [] };
  }
  const ruleWarnings = filterInvalidPermissionRules(data, sourcePath);
  const parseResult = SettingsSchema().safeParse(data);
  if (!parseResult.success) {
    const errors = formatZodError(parseResult.error, sourcePath);
    return { settings: {}, errors: [...ruleWarnings, ...errors] };
  }
  return { settings: parseResult.data, errors: ruleWarnings };
}
function parseRegQueryStdout(stdout, valueName = "Settings") {
  const lines = stdout.split(/\r?\n/);
  const escaped = valueName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^\\s+${escaped}\\s+REG_(?:EXPAND_)?SZ\\s+(.*)$`, "i");
  for (const line of lines) {
    const match = line.match(re);
    if (match && match[1]) {
      return match[1].trimEnd();
    }
  }
  return null;
}
function consumeRawReadResult(raw) {
  if (raw.plistStdouts && raw.plistStdouts.length > 0) {
    const { stdout, label } = raw.plistStdouts[0];
    const result = parseCommandOutputAsSettings(stdout, label);
    if (Object.keys(result.settings).length > 0) {
      return { mdm: result, hkcu: EMPTY_RESULT };
    }
  }
  if (raw.hklmStdout) {
    const jsonString = parseRegQueryStdout(raw.hklmStdout);
    if (jsonString) {
      const result = parseCommandOutputAsSettings(
        jsonString,
        `Registry: ${WINDOWS_REGISTRY_KEY_PATH_HKLM}\\${WINDOWS_REGISTRY_VALUE_NAME}`
      );
      if (Object.keys(result.settings).length > 0) {
        return { mdm: result, hkcu: EMPTY_RESULT };
      }
    }
  }
  if (hasManagedSettingsFile()) {
    return { mdm: EMPTY_RESULT, hkcu: EMPTY_RESULT };
  }
  if (raw.hkcuStdout) {
    const jsonString = parseRegQueryStdout(raw.hkcuStdout);
    if (jsonString) {
      const result = parseCommandOutputAsSettings(
        jsonString,
        `Registry: ${WINDOWS_REGISTRY_KEY_PATH_HKCU}\\${WINDOWS_REGISTRY_VALUE_NAME}`
      );
      return { mdm: EMPTY_RESULT, hkcu: result };
    }
  }
  return { mdm: EMPTY_RESULT, hkcu: EMPTY_RESULT };
}
function hasManagedSettingsFile() {
  try {
    const filePath = join(getManagedFilePath(), "managed-settings.json");
    const content = readFileSync(filePath);
    const data = safeParseJSON(content, false);
    if (data && typeof data === "object" && Object.keys(data).length > 0) {
      return true;
    }
  } catch {
  }
  try {
    const dropInDir = getManagedSettingsDropInDir();
    const entries = getFsImplementation().readdirSync(dropInDir);
    for (const d of entries) {
      if (!(d.isFile() || d.isSymbolicLink()) || !d.name.endsWith(".json") || d.name.startsWith(".")) {
        continue;
      }
      try {
        const content = readFileSync(join(dropInDir, d.name));
        const data = safeParseJSON(content, false);
        if (data && typeof data === "object" && Object.keys(data).length > 0) {
          return true;
        }
      } catch {
      }
    }
  } catch {
  }
  return false;
}
export {
  clearMdmSettingsCache,
  ensureMdmSettingsLoaded,
  getHkcuSettings,
  getMdmSettings,
  parseCommandOutputAsSettings,
  parseRegQueryStdout,
  refreshMdmSettings,
  setMdmSettingsCache,
  startMdmSettingsLoad
};
