const feature = (_name) => false;
import { randomUUID } from "crypto";
import { getSdkBetas, getSessionId } from "../../bootstrap/state.js";
import { DEFAULT_OUTPUT_STYLE_NAME } from "../../constants/outputStyles.js";
import {
  AGENT_TOOL_NAME,
  LEGACY_AGENT_TOOL_NAME
} from "../../tools/AgentTool/constants.js";
import { getAnthropicApiKeyWithSource } from "../auth.js";
import { getCwd } from "../cwd.js";
import { getFastModeState } from "../fastMode.js";
import { getSettings_DEPRECATED } from "../settings/settings.js";
function sdkCompatToolName(name) {
  return name === AGENT_TOOL_NAME ? LEGACY_AGENT_TOOL_NAME : name;
}
function buildSystemInitMessage(inputs) {
  const settings = getSettings_DEPRECATED();
  const outputStyle = settings?.outputStyle ?? DEFAULT_OUTPUT_STYLE_NAME;
  const initMessage = {
    type: "system",
    subtype: "init",
    cwd: getCwd(),
    session_id: getSessionId(),
    tools: inputs.tools.map((tool) => sdkCompatToolName(tool.name)),
    mcp_servers: inputs.mcpClients.map((client) => ({
      name: client.name,
      status: client.type
    })),
    model: inputs.model,
    permissionMode: inputs.permissionMode,
    slash_commands: inputs.commands.filter((c) => c.userInvocable !== false).map((c) => c.name),
    apiKeySource: getAnthropicApiKeyWithSource().source,
    betas: getSdkBetas(),
    claude_code_version: "0.0.0-dev",
    output_style: outputStyle,
    agents: inputs.agents.map((agent) => agent.agentType),
    skills: inputs.skills.filter((s) => s.userInvocable !== false).map((skill) => skill.name),
    plugins: inputs.plugins.map((plugin) => ({
      name: plugin.name,
      path: plugin.path,
      source: plugin.source
    })),
    uuid: randomUUID()
  };
  if (false) {
    ;
    initMessage.messaging_socket_path = null.getUdsMessagingSocketPath();
  }
  initMessage.fast_mode_state = getFastModeState(inputs.model, inputs.fastMode);
  return initMessage;
}
export {
  buildSystemInitMessage,
  sdkCompatToolName
};
