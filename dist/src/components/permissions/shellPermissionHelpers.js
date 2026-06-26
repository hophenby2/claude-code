import { jsx, jsxs } from "react/jsx-runtime";
import { basename, sep } from "path";
import { getOriginalCwd } from "../../bootstrap/state.js";
import { Text } from "../../ink.js";
import { permissionRuleExtractPrefix } from "../../utils/permissions/shellRuleMatching.js";
function commandListDisplay(commands) {
  switch (commands.length) {
    case 0:
      return "";
    case 1:
      return /* @__PURE__ */ jsx(Text, { bold: true, children: commands[0] });
    case 2:
      return /* @__PURE__ */ jsxs(Text, { children: [
        /* @__PURE__ */ jsx(Text, { bold: true, children: commands[0] }),
        " and ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: commands[1] })
      ] });
    default:
      return /* @__PURE__ */ jsxs(Text, { children: [
        /* @__PURE__ */ jsx(Text, { bold: true, children: commands.slice(0, -1).join(", ") }),
        ", and",
        " ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: commands.slice(-1)[0] })
      ] });
  }
}
function commandListDisplayTruncated(commands) {
  const plainText = commands.join(", ");
  if (plainText.length > 50) {
    return "similar";
  }
  return commandListDisplay(commands);
}
function formatPathList(paths) {
  if (paths.length === 0) return "";
  const names = paths.map((p) => basename(p) || p);
  if (names.length === 1) {
    return /* @__PURE__ */ jsxs(Text, { children: [
      /* @__PURE__ */ jsx(Text, { bold: true, children: names[0] }),
      sep
    ] });
  }
  if (names.length === 2) {
    return /* @__PURE__ */ jsxs(Text, { children: [
      /* @__PURE__ */ jsx(Text, { bold: true, children: names[0] }),
      sep,
      " and ",
      /* @__PURE__ */ jsx(Text, { bold: true, children: names[1] }),
      sep
    ] });
  }
  return /* @__PURE__ */ jsxs(Text, { children: [
    /* @__PURE__ */ jsx(Text, { bold: true, children: names[0] }),
    sep,
    ", ",
    /* @__PURE__ */ jsx(Text, { bold: true, children: names[1] }),
    sep,
    " and ",
    paths.length - 2,
    " more"
  ] });
}
function generateShellSuggestionsLabel(suggestions, shellToolName, commandTransform) {
  const allRules = suggestions.filter((s) => s.type === "addRules").flatMap((s) => s.rules || []);
  const readRules = allRules.filter((r) => r.toolName === "Read");
  const shellRules = allRules.filter((r) => r.toolName === shellToolName);
  const directories = suggestions.filter((s) => s.type === "addDirectories").flatMap((s) => s.directories || []);
  const readPaths = readRules.map((r) => r.ruleContent?.replace("/**", "") || "").filter((p) => p);
  const shellCommands = [...new Set(shellRules.flatMap((rule) => {
    if (!rule.ruleContent) return [];
    const command = permissionRuleExtractPrefix(rule.ruleContent) ?? rule.ruleContent;
    return commandTransform ? commandTransform(command) : command;
  }))];
  const hasDirectories = directories.length > 0;
  const hasReadPaths = readPaths.length > 0;
  const hasCommands = shellCommands.length > 0;
  if (hasReadPaths && !hasDirectories && !hasCommands) {
    if (readPaths.length === 1) {
      const firstPath = readPaths[0];
      const dirName = basename(firstPath) || firstPath;
      return /* @__PURE__ */ jsxs(Text, { children: [
        "Yes, allow reading from ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: dirName }),
        sep,
        " from this project"
      ] });
    }
    return /* @__PURE__ */ jsxs(Text, { children: [
      "Yes, allow reading from ",
      formatPathList(readPaths),
      " from this project"
    ] });
  }
  if (hasDirectories && !hasReadPaths && !hasCommands) {
    if (directories.length === 1) {
      const firstDir = directories[0];
      const dirName = basename(firstDir) || firstDir;
      return /* @__PURE__ */ jsxs(Text, { children: [
        "Yes, and always allow access to ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: dirName }),
        sep,
        " from this project"
      ] });
    }
    return /* @__PURE__ */ jsxs(Text, { children: [
      "Yes, and always allow access to ",
      formatPathList(directories),
      " from this project"
    ] });
  }
  if (hasCommands && !hasDirectories && !hasReadPaths) {
    return /* @__PURE__ */ jsxs(Text, { children: [
      "Yes, and don't ask again for ",
      commandListDisplayTruncated(shellCommands),
      " commands in",
      " ",
      /* @__PURE__ */ jsx(Text, { bold: true, children: getOriginalCwd() })
    ] });
  }
  if ((hasDirectories || hasReadPaths) && !hasCommands) {
    const allPaths = [...directories, ...readPaths];
    if (hasDirectories && hasReadPaths) {
      return /* @__PURE__ */ jsxs(Text, { children: [
        "Yes, and always allow access to ",
        formatPathList(allPaths),
        " from this project"
      ] });
    }
  }
  if ((hasDirectories || hasReadPaths) && hasCommands) {
    const allPaths = [...directories, ...readPaths];
    if (allPaths.length === 1 && shellCommands.length === 1) {
      return /* @__PURE__ */ jsxs(Text, { children: [
        "Yes, and allow access to ",
        formatPathList(allPaths),
        " and",
        " ",
        commandListDisplayTruncated(shellCommands),
        " commands"
      ] });
    }
    return /* @__PURE__ */ jsxs(Text, { children: [
      "Yes, and allow ",
      formatPathList(allPaths),
      " access and",
      " ",
      commandListDisplayTruncated(shellCommands),
      " commands"
    ] });
  }
  return null;
}
export {
  generateShellSuggestionsLabel
};
