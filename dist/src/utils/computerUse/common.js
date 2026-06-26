import { normalizeNameForMCP } from "../../services/mcp/normalization.js";
import { env } from "../env.js";
const COMPUTER_USE_MCP_SERVER_NAME = "computer-use";
const CLI_HOST_BUNDLE_ID = "com.anthropic.claude-code.cli-no-window";
const TERMINAL_BUNDLE_ID_FALLBACK = {
  "iTerm.app": "com.googlecode.iterm2",
  Apple_Terminal: "com.apple.Terminal",
  ghostty: "com.mitchellh.ghostty",
  kitty: "net.kovidgoyal.kitty",
  WarpTerminal: "dev.warp.Warp-Stable",
  vscode: "com.microsoft.VSCode"
};
function getTerminalBundleId() {
  const cfBundleId = process.env.__CFBundleIdentifier;
  if (cfBundleId) return cfBundleId;
  return TERMINAL_BUNDLE_ID_FALLBACK[env.terminal ?? ""] ?? null;
}
const CLI_CU_CAPABILITIES = {
  screenshotFiltering: "native",
  platform: "darwin"
};
function isComputerUseMCPServer(name) {
  return normalizeNameForMCP(name) === COMPUTER_USE_MCP_SERVER_NAME;
}
export {
  CLI_CU_CAPABILITIES,
  CLI_HOST_BUNDLE_ID,
  COMPUTER_USE_MCP_SERVER_NAME,
  getTerminalBundleId,
  isComputerUseMCPServer
};
