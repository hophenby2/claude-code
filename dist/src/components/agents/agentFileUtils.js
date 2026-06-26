import { mkdir, open, unlink } from "fs/promises";
import { join } from "path";
import { getManagedFilePath } from "../../utils/settings/managedPath.js";
import {
  isBuiltInAgent,
  isPluginAgent
} from "../../tools/AgentTool/loadAgentsDir.js";
import { getCwd } from "../../utils/cwd.js";
import { getClaudeConfigHomeDir } from "../../utils/envUtils.js";
import { getErrnoCode } from "../../utils/errors.js";
import { AGENT_PATHS } from "./types.js";
function formatAgentAsMarkdown(agentType, whenToUse, tools, systemPrompt, color, model, memory, effort) {
  const escapedWhenToUse = whenToUse.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\\\n");
  const isAllTools = tools === void 0 || tools.length === 1 && tools[0] === "*";
  const toolsLine = isAllTools ? "" : `
tools: ${tools.join(", ")}`;
  const modelLine = model ? `
model: ${model}` : "";
  const effortLine = effort !== void 0 ? `
effort: ${effort}` : "";
  const colorLine = color ? `
color: ${color}` : "";
  const memoryLine = memory ? `
memory: ${memory}` : "";
  return `---
name: ${agentType}
description: "${escapedWhenToUse}"${toolsLine}${modelLine}${effortLine}${colorLine}${memoryLine}
---

${systemPrompt}
`;
}
function getAgentDirectoryPath(location) {
  switch (location) {
    case "flagSettings":
      throw new Error(`Cannot get directory path for ${location} agents`);
    case "userSettings":
      return join(getClaudeConfigHomeDir(), AGENT_PATHS.AGENTS_DIR);
    case "projectSettings":
      return join(getCwd(), AGENT_PATHS.FOLDER_NAME, AGENT_PATHS.AGENTS_DIR);
    case "policySettings":
      return join(
        getManagedFilePath(),
        AGENT_PATHS.FOLDER_NAME,
        AGENT_PATHS.AGENTS_DIR
      );
    case "localSettings":
      return join(getCwd(), AGENT_PATHS.FOLDER_NAME, AGENT_PATHS.AGENTS_DIR);
  }
}
function getRelativeAgentDirectoryPath(location) {
  switch (location) {
    case "projectSettings":
      return join(".", AGENT_PATHS.FOLDER_NAME, AGENT_PATHS.AGENTS_DIR);
    default:
      return getAgentDirectoryPath(location);
  }
}
function getNewAgentFilePath(agent) {
  const dirPath = getAgentDirectoryPath(agent.source);
  return join(dirPath, `${agent.agentType}.md`);
}
function getActualAgentFilePath(agent) {
  if (agent.source === "built-in") {
    return "Built-in";
  }
  if (agent.source === "plugin") {
    throw new Error("Cannot get file path for plugin agents");
  }
  const dirPath = getAgentDirectoryPath(agent.source);
  const filename = agent.filename || agent.agentType;
  return join(dirPath, `${filename}.md`);
}
function getNewRelativeAgentFilePath(agent) {
  if (agent.source === "built-in") {
    return "Built-in";
  }
  const dirPath = getRelativeAgentDirectoryPath(agent.source);
  return join(dirPath, `${agent.agentType}.md`);
}
function getActualRelativeAgentFilePath(agent) {
  if (isBuiltInAgent(agent)) {
    return "Built-in";
  }
  if (isPluginAgent(agent)) {
    return `Plugin: ${agent.plugin || "Unknown"}`;
  }
  if (agent.source === "flagSettings") {
    return "CLI argument";
  }
  const dirPath = getRelativeAgentDirectoryPath(agent.source);
  const filename = agent.filename || agent.agentType;
  return join(dirPath, `${filename}.md`);
}
async function ensureAgentDirectoryExists(source) {
  const dirPath = getAgentDirectoryPath(source);
  await mkdir(dirPath, { recursive: true });
  return dirPath;
}
async function saveAgentToFile(source, agentType, whenToUse, tools, systemPrompt, checkExists = true, color, model, memory, effort) {
  if (source === "built-in") {
    throw new Error("Cannot save built-in agents");
  }
  await ensureAgentDirectoryExists(source);
  const filePath = getNewAgentFilePath({ source, agentType });
  const content = formatAgentAsMarkdown(
    agentType,
    whenToUse,
    tools,
    systemPrompt,
    color,
    model,
    memory,
    effort
  );
  try {
    await writeFileAndFlush(filePath, content, checkExists ? "wx" : "w");
  } catch (e) {
    if (getErrnoCode(e) === "EEXIST") {
      throw new Error(`Agent file already exists: ${filePath}`);
    }
    throw e;
  }
}
async function updateAgentFile(agent, newWhenToUse, newTools, newSystemPrompt, newColor, newModel, newMemory, newEffort) {
  if (agent.source === "built-in") {
    throw new Error("Cannot update built-in agents");
  }
  const filePath = getActualAgentFilePath(agent);
  const content = formatAgentAsMarkdown(
    agent.agentType,
    newWhenToUse,
    newTools,
    newSystemPrompt,
    newColor,
    newModel,
    newMemory,
    newEffort
  );
  await writeFileAndFlush(filePath, content);
}
async function deleteAgentFromFile(agent) {
  if (agent.source === "built-in") {
    throw new Error("Cannot delete built-in agents");
  }
  const filePath = getActualAgentFilePath(agent);
  try {
    await unlink(filePath);
  } catch (e) {
    const code = getErrnoCode(e);
    if (code !== "ENOENT") {
      throw e;
    }
  }
}
async function writeFileAndFlush(filePath, content, flag = "w") {
  const handle = await open(filePath, flag);
  try {
    await handle.writeFile(content, { encoding: "utf-8" });
    await handle.datasync();
  } finally {
    await handle.close();
  }
}
export {
  deleteAgentFromFile,
  formatAgentAsMarkdown,
  getActualAgentFilePath,
  getActualRelativeAgentFilePath,
  getNewAgentFilePath,
  getNewRelativeAgentFilePath,
  saveAgentToFile,
  updateAgentFile
};
