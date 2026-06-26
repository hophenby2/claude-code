const CLI_COMMAND_MAPPING = {
  // Sourcegraph ecosystem
  src: "sourcegraph",
  cody: "cody",
  // AI coding assistants
  aider: "aider",
  tabby: "tabby",
  tabnine: "tabnine",
  augment: "augment",
  pieces: "pieces",
  qodo: "qodo",
  aide: "aide",
  // Code search tools
  hound: "hound",
  seagoat: "seagoat",
  bloop: "bloop",
  gitloop: "gitloop",
  // Cloud provider AI assistants
  q: "amazon-q",
  gemini: "gemini"
};
const MCP_SERVER_PATTERNS = [
  // Sourcegraph ecosystem
  { pattern: /^sourcegraph$/i, tool: "sourcegraph" },
  { pattern: /^cody$/i, tool: "cody" },
  { pattern: /^openctx$/i, tool: "openctx" },
  // AI coding assistants
  { pattern: /^aider$/i, tool: "aider" },
  { pattern: /^continue$/i, tool: "continue" },
  { pattern: /^github[-_]?copilot$/i, tool: "github-copilot" },
  { pattern: /^copilot$/i, tool: "github-copilot" },
  { pattern: /^cursor$/i, tool: "cursor" },
  { pattern: /^tabby$/i, tool: "tabby" },
  { pattern: /^codeium$/i, tool: "codeium" },
  { pattern: /^tabnine$/i, tool: "tabnine" },
  { pattern: /^augment[-_]?code$/i, tool: "augment" },
  { pattern: /^augment$/i, tool: "augment" },
  { pattern: /^windsurf$/i, tool: "windsurf" },
  { pattern: /^aide$/i, tool: "aide" },
  { pattern: /^codestory$/i, tool: "aide" },
  { pattern: /^pieces$/i, tool: "pieces" },
  { pattern: /^qodo$/i, tool: "qodo" },
  { pattern: /^amazon[-_]?q$/i, tool: "amazon-q" },
  { pattern: /^gemini[-_]?code[-_]?assist$/i, tool: "gemini" },
  { pattern: /^gemini$/i, tool: "gemini" },
  // Code search tools
  { pattern: /^hound$/i, tool: "hound" },
  { pattern: /^seagoat$/i, tool: "seagoat" },
  { pattern: /^bloop$/i, tool: "bloop" },
  { pattern: /^gitloop$/i, tool: "gitloop" },
  // MCP code indexing servers
  { pattern: /^claude[-_]?context$/i, tool: "claude-context" },
  { pattern: /^code[-_]?index[-_]?mcp$/i, tool: "code-index-mcp" },
  { pattern: /^code[-_]?index$/i, tool: "code-index-mcp" },
  { pattern: /^local[-_]?code[-_]?search$/i, tool: "local-code-search" },
  { pattern: /^codebase$/i, tool: "autodev-codebase" },
  { pattern: /^autodev[-_]?codebase$/i, tool: "autodev-codebase" },
  { pattern: /^code[-_]?context$/i, tool: "claude-context" }
];
function detectCodeIndexingFromCommand(command) {
  const trimmed = command.trim();
  const firstWord = trimmed.split(/\s+/)[0]?.toLowerCase();
  if (!firstWord) {
    return void 0;
  }
  if (firstWord === "npx" || firstWord === "bunx") {
    const secondWord = trimmed.split(/\s+/)[1]?.toLowerCase();
    if (secondWord && secondWord in CLI_COMMAND_MAPPING) {
      return CLI_COMMAND_MAPPING[secondWord];
    }
  }
  return CLI_COMMAND_MAPPING[firstWord];
}
function detectCodeIndexingFromMcpTool(toolName) {
  if (!toolName.startsWith("mcp__")) {
    return void 0;
  }
  const parts = toolName.split("__");
  if (parts.length < 3) {
    return void 0;
  }
  const serverName = parts[1];
  if (!serverName) {
    return void 0;
  }
  for (const { pattern, tool } of MCP_SERVER_PATTERNS) {
    if (pattern.test(serverName)) {
      return tool;
    }
  }
  return void 0;
}
function detectCodeIndexingFromMcpServerName(serverName) {
  for (const { pattern, tool } of MCP_SERVER_PATTERNS) {
    if (pattern.test(serverName)) {
      return tool;
    }
  }
  return void 0;
}
export {
  detectCodeIndexingFromCommand,
  detectCodeIndexingFromMcpServerName,
  detectCodeIndexingFromMcpTool
};
