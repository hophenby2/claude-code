import memoize from "lodash-es/memoize.js";
import { homedir } from "os";
import { isAbsolute, join, normalize, sep } from "path";
import {
  getIsNonInteractiveSession,
  getProjectRoot
} from "../bootstrap/state.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../services/analytics/growthbook.js";
import {
  getClaudeConfigHomeDir,
  isEnvDefinedFalsy,
  isEnvTruthy
} from "../utils/envUtils.js";
import { findCanonicalGitRoot } from "../utils/git.js";
import { sanitizePath } from "../utils/path.js";
import {
  getInitialSettings,
  getSettingsForSource
} from "../utils/settings/settings.js";
function isAutoMemoryEnabled() {
  const envVal = process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY;
  if (isEnvTruthy(envVal)) {
    return false;
  }
  if (isEnvDefinedFalsy(envVal)) {
    return true;
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)) {
    return false;
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) && !process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR) {
    return false;
  }
  const settings = getInitialSettings();
  if (settings.autoMemoryEnabled !== void 0) {
    return settings.autoMemoryEnabled;
  }
  return true;
}
function isExtractModeActive() {
  if (!getFeatureValue_CACHED_MAY_BE_STALE("tengu_passport_quail", false)) {
    return false;
  }
  return !getIsNonInteractiveSession() || getFeatureValue_CACHED_MAY_BE_STALE("tengu_slate_thimble", false);
}
function getMemoryBaseDir() {
  if (process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR) {
    return process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR;
  }
  return getClaudeConfigHomeDir();
}
const AUTO_MEM_DIRNAME = "memory";
const AUTO_MEM_ENTRYPOINT_NAME = "MEMORY.md";
function validateMemoryPath(raw, expandTilde) {
  if (!raw) {
    return void 0;
  }
  let candidate = raw;
  if (expandTilde && (candidate.startsWith("~/") || candidate.startsWith("~\\"))) {
    const rest = candidate.slice(2);
    const restNorm = normalize(rest || ".");
    if (restNorm === "." || restNorm === "..") {
      return void 0;
    }
    candidate = join(homedir(), rest);
  }
  const normalized = normalize(candidate).replace(/[/\\]+$/, "");
  if (!isAbsolute(normalized) || normalized.length < 3 || /^[A-Za-z]:$/.test(normalized) || normalized.startsWith("\\\\") || normalized.startsWith("//") || normalized.includes("\0")) {
    return void 0;
  }
  return (normalized + sep).normalize("NFC");
}
function getAutoMemPathOverride() {
  return validateMemoryPath(
    process.env.CLAUDE_COWORK_MEMORY_PATH_OVERRIDE,
    false
  );
}
function getAutoMemPathSetting() {
  const dir = getSettingsForSource("policySettings")?.autoMemoryDirectory ?? getSettingsForSource("flagSettings")?.autoMemoryDirectory ?? getSettingsForSource("localSettings")?.autoMemoryDirectory ?? getSettingsForSource("userSettings")?.autoMemoryDirectory;
  return validateMemoryPath(dir, true);
}
function hasAutoMemPathOverride() {
  return getAutoMemPathOverride() !== void 0;
}
function getAutoMemBase() {
  return findCanonicalGitRoot(getProjectRoot()) ?? getProjectRoot();
}
const getAutoMemPath = memoize(
  () => {
    const override = getAutoMemPathOverride() ?? getAutoMemPathSetting();
    if (override) {
      return override;
    }
    const projectsDir = join(getMemoryBaseDir(), "projects");
    return (join(projectsDir, sanitizePath(getAutoMemBase()), AUTO_MEM_DIRNAME) + sep).normalize("NFC");
  },
  () => getProjectRoot()
);
function getAutoMemDailyLogPath(date = /* @__PURE__ */ new Date()) {
  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, "0");
  const dd = date.getDate().toString().padStart(2, "0");
  return join(getAutoMemPath(), "logs", yyyy, mm, `${yyyy}-${mm}-${dd}.md`);
}
function getAutoMemEntrypoint() {
  return join(getAutoMemPath(), AUTO_MEM_ENTRYPOINT_NAME);
}
function isAutoMemPath(absolutePath) {
  const normalizedPath = normalize(absolutePath);
  return normalizedPath.startsWith(getAutoMemPath());
}
export {
  getAutoMemDailyLogPath,
  getAutoMemEntrypoint,
  getAutoMemPath,
  getMemoryBaseDir,
  hasAutoMemPathOverride,
  isAutoMemPath,
  isAutoMemoryEnabled,
  isExtractModeActive
};
