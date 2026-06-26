import {
  buildComputerUseTools,
  createComputerUseMcpServer
} from "@ant/computer-use-mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { homedir } from "os";
import { shutdownDatadog } from "../../services/analytics/datadog.js";
import { shutdown1PEventLogging } from "../../services/analytics/firstPartyEventLogger.js";
import { initializeAnalyticsSink } from "../../services/analytics/sink.js";
import { enableConfigs } from "../config.js";
import { logForDebugging } from "../debug.js";
import { filterAppsForDescription } from "./appNames.js";
import { getChicagoCoordinateMode } from "./gates.js";
import { getComputerUseHostAdapter } from "./hostAdapter.js";
const APP_ENUM_TIMEOUT_MS = 1e3;
async function tryGetInstalledAppNames() {
  const adapter = getComputerUseHostAdapter();
  const enumP = adapter.executor.listInstalledApps();
  let timer;
  const timeoutP = new Promise((resolve) => {
    timer = setTimeout(resolve, APP_ENUM_TIMEOUT_MS, void 0);
  });
  const installed = await Promise.race([enumP, timeoutP]).catch(() => void 0).finally(() => clearTimeout(timer));
  if (!installed) {
    void enumP.catch(() => {
    });
    logForDebugging(
      `[Computer Use MCP] app enumeration exceeded ${APP_ENUM_TIMEOUT_MS}ms or failed; tool description omits list`
    );
    return void 0;
  }
  return filterAppsForDescription(installed, homedir());
}
async function createComputerUseMcpServerForCli() {
  const adapter = getComputerUseHostAdapter();
  const coordinateMode = getChicagoCoordinateMode();
  const server = createComputerUseMcpServer(adapter, coordinateMode);
  const installedAppNames = await tryGetInstalledAppNames();
  const tools = buildComputerUseTools(
    adapter.executor.capabilities,
    coordinateMode,
    installedAppNames
  );
  server.setRequestHandler(
    ListToolsRequestSchema,
    async () => adapter.isDisabled() ? { tools: [] } : { tools }
  );
  return server;
}
async function runComputerUseMcpServer() {
  enableConfigs();
  initializeAnalyticsSink();
  const server = await createComputerUseMcpServerForCli();
  const transport = new StdioServerTransport();
  let exiting = false;
  const shutdownAndExit = async () => {
    if (exiting) return;
    exiting = true;
    await Promise.all([shutdown1PEventLogging(), shutdownDatadog()]);
    process.exit(0);
  };
  process.stdin.on("end", () => void shutdownAndExit());
  process.stdin.on("error", () => void shutdownAndExit());
  logForDebugging("[Computer Use MCP] Starting MCP server");
  await server.connect(transport);
  logForDebugging("[Computer Use MCP] MCP server started");
}
export {
  createComputerUseMcpServerForCli,
  runComputerUseMcpServer
};
