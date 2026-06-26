import { isTeamMemFile } from "../memdir/teamMemPaths.js";
import { FILE_EDIT_TOOL_NAME } from "../tools/FileEditTool/constants.js";
import { FILE_WRITE_TOOL_NAME } from "../tools/FileWriteTool/prompt.js";
function isTeamMemorySearch(toolInput) {
  const input = toolInput;
  if (!input) {
    return false;
  }
  if (input.path && isTeamMemFile(input.path)) {
    return true;
  }
  return false;
}
function isTeamMemoryWriteOrEdit(toolName, toolInput) {
  if (toolName !== FILE_WRITE_TOOL_NAME && toolName !== FILE_EDIT_TOOL_NAME) {
    return false;
  }
  const input = toolInput;
  const filePath = input?.file_path ?? input?.path;
  return filePath !== void 0 && isTeamMemFile(filePath);
}
function appendTeamMemorySummaryParts(memoryCounts, isActive, parts) {
  const teamReadCount = memoryCounts.teamMemoryReadCount ?? 0;
  const teamSearchCount = memoryCounts.teamMemorySearchCount ?? 0;
  const teamWriteCount = memoryCounts.teamMemoryWriteCount ?? 0;
  if (teamReadCount > 0) {
    const verb = isActive ? parts.length === 0 ? "Recalling" : "recalling" : parts.length === 0 ? "Recalled" : "recalled";
    parts.push(
      `${verb} ${teamReadCount} team ${teamReadCount === 1 ? "memory" : "memories"}`
    );
  }
  if (teamSearchCount > 0) {
    const verb = isActive ? parts.length === 0 ? "Searching" : "searching" : parts.length === 0 ? "Searched" : "searched";
    parts.push(`${verb} team memories`);
  }
  if (teamWriteCount > 0) {
    const verb = isActive ? parts.length === 0 ? "Writing" : "writing" : parts.length === 0 ? "Wrote" : "wrote";
    parts.push(
      `${verb} ${teamWriteCount} team ${teamWriteCount === 1 ? "memory" : "memories"}`
    );
  }
}
export {
  appendTeamMemorySummaryParts,
  isTeamMemFile,
  isTeamMemorySearch,
  isTeamMemoryWriteOrEdit
};
