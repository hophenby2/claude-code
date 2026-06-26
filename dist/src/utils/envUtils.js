import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
import memoize from "lodash-es/memoize.js";
import { homedir } from "os";
import { join } from "path";
const getClaudeConfigHomeDir = memoize(
  () => {
    return (process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude")).normalize("NFC");
  },
  () => process.env.CLAUDE_CONFIG_DIR
);
function getTeamsDir() {
  return join(getClaudeConfigHomeDir(), "teams");
}
function hasNodeOption(flag) {
  const nodeOptions = process.env.NODE_OPTIONS;
  if (!nodeOptions) {
    return false;
  }
  return nodeOptions.split(/\s+/).includes(flag);
}
function isEnvTruthy(envVar) {
  if (!envVar) return false;
  if (typeof envVar === "boolean") return envVar;
  const normalizedValue = envVar.toLowerCase().trim();
  return ["1", "true", "yes", "on"].includes(normalizedValue);
}
function isEnvDefinedFalsy(envVar) {
  if (envVar === void 0) return false;
  if (typeof envVar === "boolean") return !envVar;
  if (!envVar) return false;
  const normalizedValue = envVar.toLowerCase().trim();
  return ["0", "false", "no", "off"].includes(normalizedValue);
}
function isBareMode() {
  return isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE) || process.argv.includes("--bare");
}
function parseEnvVars(rawEnvArgs) {
  const parsedEnv = {};
  if (rawEnvArgs) {
    for (const envStr of rawEnvArgs) {
      const [key, ...valueParts] = envStr.split("=");
      if (!key || valueParts.length === 0) {
        throw new Error(
          `Invalid environment variable format: ${envStr}, environment variables should be added as: -e KEY1=value1 -e KEY2=value2`
        );
      }
      parsedEnv[key] = valueParts.join("=");
    }
  }
  return parsedEnv;
}
function getAWSRegion() {
  return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
}
function getDefaultVertexRegion() {
  return process.env.CLOUD_ML_REGION || "us-east5";
}
function shouldMaintainProjectWorkingDir() {
  return isEnvTruthy(process.env.CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR);
}
function isRunningOnHomespace() {
  return process.env.USER_TYPE === "ant" && isEnvTruthy(process.env.COO_RUNNING_ON_HOMESPACE);
}
function isInProtectedNamespace() {
  if (process.env.USER_TYPE === "ant") {
    return require2("./protectedNamespace.js").checkProtectedNamespace();
  }
  return false;
}
const VERTEX_REGION_OVERRIDES = [
  ["claude-haiku-4-5", "VERTEX_REGION_CLAUDE_HAIKU_4_5"],
  ["claude-3-5-haiku", "VERTEX_REGION_CLAUDE_3_5_HAIKU"],
  ["claude-3-5-sonnet", "VERTEX_REGION_CLAUDE_3_5_SONNET"],
  ["claude-3-7-sonnet", "VERTEX_REGION_CLAUDE_3_7_SONNET"],
  ["claude-opus-4-1", "VERTEX_REGION_CLAUDE_4_1_OPUS"],
  ["claude-opus-4", "VERTEX_REGION_CLAUDE_4_0_OPUS"],
  ["claude-sonnet-4-6", "VERTEX_REGION_CLAUDE_4_6_SONNET"],
  ["claude-sonnet-4-5", "VERTEX_REGION_CLAUDE_4_5_SONNET"],
  ["claude-sonnet-4", "VERTEX_REGION_CLAUDE_4_0_SONNET"]
];
function getVertexRegionForModel(model) {
  if (model) {
    const match = VERTEX_REGION_OVERRIDES.find(
      ([prefix]) => model.startsWith(prefix)
    );
    if (match) {
      return process.env[match[1]] || getDefaultVertexRegion();
    }
  }
  return getDefaultVertexRegion();
}
export {
  getAWSRegion,
  getClaudeConfigHomeDir,
  getDefaultVertexRegion,
  getTeamsDir,
  getVertexRegionForModel,
  hasNodeOption,
  isBareMode,
  isEnvDefinedFalsy,
  isEnvTruthy,
  isInProtectedNamespace,
  isRunningOnHomespace,
  parseEnvVars,
  shouldMaintainProjectWorkingDir
};
