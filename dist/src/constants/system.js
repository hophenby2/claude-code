const feature = (_name) => false;
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../services/analytics/growthbook.js";
import { logForDebugging } from "../utils/debug.js";
import { isEnvDefinedFalsy } from "../utils/envUtils.js";
import { getAPIProvider } from "../utils/model/providers.js";
import { getWorkload } from "../utils/workloadContext.js";
const DEFAULT_PREFIX = `You are Claude Code, Anthropic's official CLI for Claude.`;
const AGENT_SDK_CLAUDE_CODE_PRESET_PREFIX = `You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK.`;
const AGENT_SDK_PREFIX = `You are a Claude agent, built on Anthropic's Claude Agent SDK.`;
const CLI_SYSPROMPT_PREFIX_VALUES = [
  DEFAULT_PREFIX,
  AGENT_SDK_CLAUDE_CODE_PRESET_PREFIX,
  AGENT_SDK_PREFIX
];
const CLI_SYSPROMPT_PREFIXES = new Set(
  CLI_SYSPROMPT_PREFIX_VALUES
);
function getCLISyspromptPrefix(options) {
  const apiProvider = getAPIProvider();
  if (apiProvider === "vertex") {
    return DEFAULT_PREFIX;
  }
  if (options?.isNonInteractive) {
    if (options.hasAppendSystemPrompt) {
      return AGENT_SDK_CLAUDE_CODE_PRESET_PREFIX;
    }
    return AGENT_SDK_PREFIX;
  }
  return DEFAULT_PREFIX;
}
function isAttributionHeaderEnabled() {
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_ATTRIBUTION_HEADER)) {
    return false;
  }
  return getFeatureValue_CACHED_MAY_BE_STALE("tengu_attribution_header", true);
}
function getAttributionHeader(fingerprint) {
  if (!isAttributionHeaderEnabled()) {
    return "";
  }
  const version = `${"0.0.0-dev"}.${fingerprint}`;
  const entrypoint = process.env.CLAUDE_CODE_ENTRYPOINT ?? "unknown";
  const cch = false ? " cch=00000;" : "";
  const workload = getWorkload();
  const workloadPair = workload ? ` cc_workload=${workload};` : "";
  const header = `x-anthropic-billing-header: cc_version=${version}; cc_entrypoint=${entrypoint};${cch}${workloadPair}`;
  logForDebugging(`attribution header ${header}`);
  return header;
}
export {
  CLI_SYSPROMPT_PREFIXES,
  getAttributionHeader,
  getCLISyspromptPrefix
};
