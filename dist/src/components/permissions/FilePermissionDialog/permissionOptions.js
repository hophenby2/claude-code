import { jsxs } from "react/jsx-runtime";
import { homedir } from "os";
import { basename, join, sep } from "path";
import { getOriginalCwd } from "../../../bootstrap/state.js";
import { Text } from "../../../ink.js";
import { getShortcutDisplay } from "../../../keybindings/shortcutFormat.js";
import { expandPath, getDirectoryForPath } from "../../../utils/path.js";
import { normalizeCaseForComparison, pathInAllowedWorkingPath } from "../../../utils/permissions/filesystem.js";
function isInClaudeFolder(filePath) {
  const absolutePath = expandPath(filePath);
  const claudeFolderPath = expandPath(`${getOriginalCwd()}/.claude`);
  const normalizedAbsolutePath = normalizeCaseForComparison(absolutePath);
  const normalizedClaudeFolderPath = normalizeCaseForComparison(claudeFolderPath);
  return normalizedAbsolutePath.startsWith(normalizedClaudeFolderPath + sep.toLowerCase()) || // Also match case where sep is / on posix systems
  normalizedAbsolutePath.startsWith(normalizedClaudeFolderPath + "/");
}
function isInGlobalClaudeFolder(filePath) {
  const absolutePath = expandPath(filePath);
  const globalClaudeFolderPath = join(homedir(), ".claude");
  const normalizedAbsolutePath = normalizeCaseForComparison(absolutePath);
  const normalizedGlobalClaudeFolderPath = normalizeCaseForComparison(globalClaudeFolderPath);
  return normalizedAbsolutePath.startsWith(normalizedGlobalClaudeFolderPath + sep.toLowerCase()) || normalizedAbsolutePath.startsWith(normalizedGlobalClaudeFolderPath + "/");
}
function getFilePermissionOptions({
  filePath,
  toolPermissionContext,
  operationType = "write",
  onRejectFeedbackChange,
  onAcceptFeedbackChange,
  yesInputMode = false,
  noInputMode = false
}) {
  const options = [];
  const modeCycleShortcut = getShortcutDisplay("chat:cycleMode", "Chat", "shift+tab");
  if (yesInputMode && onAcceptFeedbackChange) {
    options.push({
      type: "input",
      label: "Yes",
      value: "yes",
      placeholder: "and tell Claude what to do next",
      onChange: onAcceptFeedbackChange,
      allowEmptySubmitToCancel: true,
      option: {
        type: "accept-once"
      }
    });
  } else {
    options.push({
      label: "Yes",
      value: "yes",
      option: {
        type: "accept-once"
      }
    });
  }
  const inAllowedPath = pathInAllowedWorkingPath(filePath, toolPermissionContext);
  const inClaudeFolder = isInClaudeFolder(filePath);
  const inGlobalClaudeFolder = isInGlobalClaudeFolder(filePath);
  if ((inClaudeFolder || inGlobalClaudeFolder) && operationType !== "read") {
    options.push({
      label: "Yes, and allow Claude to edit its own settings for this session",
      value: "yes-claude-folder",
      option: {
        type: "accept-session",
        scope: inGlobalClaudeFolder ? "global-claude-folder" : "claude-folder"
      }
    });
  } else {
    let sessionLabel;
    if (inAllowedPath) {
      if (operationType === "read") {
        sessionLabel = "Yes, during this session";
      } else {
        sessionLabel = /* @__PURE__ */ jsxs(Text, { children: [
          "Yes, allow all edits during this session",
          " ",
          /* @__PURE__ */ jsxs(Text, { bold: true, children: [
            "(",
            modeCycleShortcut,
            ")"
          ] })
        ] });
      }
    } else {
      const dirPath = getDirectoryForPath(filePath);
      const dirName = basename(dirPath) || "this directory";
      if (operationType === "read") {
        sessionLabel = /* @__PURE__ */ jsxs(Text, { children: [
          "Yes, allow reading from ",
          /* @__PURE__ */ jsxs(Text, { bold: true, children: [
            dirName,
            "/"
          ] }),
          " during this session"
        ] });
      } else {
        sessionLabel = /* @__PURE__ */ jsxs(Text, { children: [
          "Yes, allow all edits in ",
          /* @__PURE__ */ jsxs(Text, { bold: true, children: [
            dirName,
            "/"
          ] }),
          " during this session ",
          /* @__PURE__ */ jsxs(Text, { bold: true, children: [
            "(",
            modeCycleShortcut,
            ")"
          ] })
        ] });
      }
    }
    options.push({
      label: sessionLabel,
      value: "yes-session",
      option: {
        type: "accept-session"
      }
    });
  }
  if (noInputMode && onRejectFeedbackChange) {
    options.push({
      type: "input",
      label: "No",
      value: "no",
      placeholder: "and tell Claude what to do differently",
      onChange: onRejectFeedbackChange,
      allowEmptySubmitToCancel: true,
      option: {
        type: "reject"
      }
    });
  } else {
    options.push({
      label: "No",
      value: "no",
      option: {
        type: "reject"
      }
    });
  }
  return options;
}
export {
  getFilePermissionOptions,
  isInClaudeFolder,
  isInGlobalClaudeFolder
};
