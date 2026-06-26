import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { relative } from "path";
import { useMemo } from "react";
import { useDiffInIDE } from "../../../hooks/useDiffInIDE.js";
import { Box, Text } from "../../../ink.js";
import { getLanguageName } from "../../../utils/cliHighlight.js";
import { getCwd } from "../../../utils/cwd.js";
import { getFsImplementation, safeResolvePath } from "../../../utils/fsOperations.js";
import { expandPath } from "../../../utils/path.js";
import { Select } from "../../CustomSelect/index.js";
import { ShowInIDEPrompt } from "../../ShowInIDEPrompt.js";
import { usePermissionRequestLogging } from "../hooks.js";
import { PermissionDialog } from "../PermissionDialog.js";
import { useFilePermissionDialog } from "./useFilePermissionDialog.js";
function FilePermissionDialog({
  toolUseConfirm,
  toolUseContext,
  onDone,
  onReject,
  title,
  subtitle,
  question = "Do you want to proceed?",
  content,
  completionType = "tool_use_single",
  path,
  parseInput,
  operationType = "write",
  ideDiffSupport,
  workerBadge,
  languageName: languageNameOverride
}) {
  const languageName = useMemo(() => languageNameOverride ?? (path ? getLanguageName(path) : "none"), [languageNameOverride, path]);
  const unaryEvent = useMemo(() => ({
    completion_type: completionType,
    language_name: languageName
  }), [completionType, languageName]);
  usePermissionRequestLogging(toolUseConfirm, unaryEvent);
  const symlinkTarget = useMemo(() => {
    if (!path || operationType === "read") {
      return null;
    }
    const expandedPath = expandPath(path);
    const fs = getFsImplementation();
    const {
      resolvedPath,
      isSymlink
    } = safeResolvePath(fs, expandedPath);
    if (isSymlink) {
      return resolvedPath;
    }
    return null;
  }, [path, operationType]);
  const fileDialogResult = useFilePermissionDialog({
    filePath: path || "",
    completionType,
    languageName,
    toolUseConfirm,
    onDone,
    onReject,
    parseInput,
    operationType
  });
  const {
    options,
    acceptFeedback,
    rejectFeedback,
    setFocusedOption,
    handleInputModeToggle,
    focusedOption,
    yesInputMode,
    noInputMode
  } = fileDialogResult;
  const parsedInput = parseInput(toolUseConfirm.input);
  const ideDiffConfig = useMemo(() => ideDiffSupport ? ideDiffSupport.getConfig(parseInput(toolUseConfirm.input)) : null, [ideDiffSupport, toolUseConfirm.input]);
  const diffParams = ideDiffConfig ? {
    onChange: (option, input) => {
      const transformedInput = ideDiffSupport.applyChanges(parsedInput, input.edits);
      fileDialogResult.onChange(option, transformedInput);
    },
    toolUseContext,
    filePath: ideDiffConfig.filePath,
    edits: (ideDiffConfig.edits || []).map((e) => ({
      old_string: e.old_string,
      new_string: e.new_string,
      replace_all: e.replace_all || false
    })),
    editMode: ideDiffConfig.editMode || "single"
  } : {
    onChange: () => {
    },
    toolUseContext,
    filePath: "",
    edits: [],
    editMode: "single"
  };
  const {
    closeTabInIDE,
    showingDiffInIDE,
    ideName
  } = useDiffInIDE(diffParams);
  const onChange = (option_0, feedback) => {
    closeTabInIDE?.();
    fileDialogResult.onChange(option_0, parsedInput, feedback?.trim());
  };
  if (showingDiffInIDE && ideDiffConfig && path) {
    return /* @__PURE__ */ jsx(ShowInIDEPrompt, { onChange: (option_1, _input, feedback_0) => onChange(option_1, feedback_0), options, filePath: path, input: parsedInput, ideName, symlinkTarget, rejectFeedback, acceptFeedback, setFocusedOption, onInputModeToggle: handleInputModeToggle, focusedOption, yesInputMode, noInputMode });
  }
  const isSymlinkOutsideCwd = symlinkTarget != null && relative(getCwd(), symlinkTarget).startsWith("..");
  const symlinkWarning = symlinkTarget ? /* @__PURE__ */ jsx(Box, { paddingX: 1, marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { color: "warning", children: isSymlinkOutsideCwd ? `This will modify ${symlinkTarget} (outside working directory) via a symlink` : `Symlink target: ${symlinkTarget}` }) }) : null;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs(PermissionDialog, { title, subtitle, innerPaddingX: 0, workerBadge, children: [
      symlinkWarning,
      content,
      /* @__PURE__ */ jsxs(Box, { flexDirection: "column", paddingX: 1, children: [
        typeof question === "string" ? /* @__PURE__ */ jsx(Text, { children: question }) : question,
        /* @__PURE__ */ jsx(Select, { options, inlineDescriptions: true, onChange: (value) => {
          const selected = options.find((opt) => opt.value === value);
          if (selected) {
            if (selected.option.type === "reject") {
              const trimmedFeedback = rejectFeedback.trim();
              onChange(selected.option, trimmedFeedback || void 0);
              return;
            }
            if (selected.option.type === "accept-once") {
              const trimmedFeedback_0 = acceptFeedback.trim();
              onChange(selected.option, trimmedFeedback_0 || void 0);
              return;
            }
            onChange(selected.option);
          }
        }, onCancel: () => onChange({
          type: "reject"
        }), onFocus: (value_0) => setFocusedOption(value_0), onInputModeToggle: handleInputModeToggle })
      ] })
    ] }),
    /* @__PURE__ */ jsx(Box, { paddingX: 1, marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "Esc to cancel",
      (focusedOption === "yes" && !yesInputMode || focusedOption === "no" && !noInputMode) && " \xB7 Tab to amend"
    ] }) })
  ] });
}
export {
  FilePermissionDialog
};
