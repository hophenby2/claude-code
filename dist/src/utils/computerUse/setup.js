import { buildComputerUseTools } from "@ant/computer-use-mcp";
import { join } from "path";
import { fileURLToPath } from "url";
import { buildMcpToolName } from "../../services/mcp/mcpStringUtils.js";
import { isInBundledMode } from "../bundledMode.js";
import { CLI_CU_CAPABILITIES, COMPUTER_USE_MCP_SERVER_NAME } from "./common.js";
import { getChicagoCoordinateMode } from "./gates.js";
function setupComputerUseMCP() {
  const allowedTools = buildComputerUseTools(
    CLI_CU_CAPABILITIES,
    getChicagoCoordinateMode()
  ).map((t) => buildMcpToolName(COMPUTER_USE_MCP_SERVER_NAME, t.name));
  const args = isInBundledMode() ? ["--computer-use-mcp"] : [
    join(fileURLToPath(import.meta.url), "..", "cli.js"),
    "--computer-use-mcp"
  ];
  return {
    mcpConfig: {
      [COMPUTER_USE_MCP_SERVER_NAME]: {
        type: "stdio",
        command: process.execPath,
        args,
        scope: "dynamic"
      }
    },
    allowedTools
  };
}
export {
  setupComputerUseMCP
};
