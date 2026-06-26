import { jsx, jsxs } from "react/jsx-runtime";
import { mkdir, writeFile } from "fs/promises";
import * as React from "react";
import { Dialog } from "../../components/design-system/Dialog.js";
import { MemoryFileSelector } from "../../components/memory/MemoryFileSelector.js";
import { getRelativeMemoryPath } from "../../components/memory/MemoryUpdateNotification.js";
import { Box, Link, Text } from "../../ink.js";
import { clearMemoryFileCaches, getMemoryFiles } from "../../utils/claudemd.js";
import { getClaudeConfigHomeDir } from "../../utils/envUtils.js";
import { getErrnoCode } from "../../utils/errors.js";
import { logError } from "../../utils/log.js";
import { editFileInEditor } from "../../utils/promptEditor.js";
function MemoryCommand({
  onDone
}) {
  const handleSelectMemoryFile = async (memoryPath) => {
    try {
      if (memoryPath.includes(getClaudeConfigHomeDir())) {
        await mkdir(getClaudeConfigHomeDir(), {
          recursive: true
        });
      }
      try {
        await writeFile(memoryPath, "", {
          encoding: "utf8",
          flag: "wx"
        });
      } catch (e) {
        if (getErrnoCode(e) !== "EEXIST") {
          throw e;
        }
      }
      await editFileInEditor(memoryPath);
      let editorSource = "default";
      let editorValue = "";
      if (process.env.VISUAL) {
        editorSource = "$VISUAL";
        editorValue = process.env.VISUAL;
      } else if (process.env.EDITOR) {
        editorSource = "$EDITOR";
        editorValue = process.env.EDITOR;
      }
      const editorInfo = editorSource !== "default" ? `Using ${editorSource}="${editorValue}".` : "";
      const editorHint = editorInfo ? `> ${editorInfo} To change editor, set $EDITOR or $VISUAL environment variable.` : `> To use a different editor, set the $EDITOR or $VISUAL environment variable.`;
      onDone(`Opened memory file at ${getRelativeMemoryPath(memoryPath)}

${editorHint}`, {
        display: "system"
      });
    } catch (error) {
      logError(error);
      onDone(`Error opening memory file: ${error}`);
    }
  };
  const handleCancel = () => {
    onDone("Cancelled memory editing", {
      display: "system"
    });
  };
  return /* @__PURE__ */ jsx(Dialog, { title: "Memory", onCancel: handleCancel, color: "remember", children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx(React.Suspense, { fallback: null, children: /* @__PURE__ */ jsx(MemoryFileSelector, { onSelect: handleSelectMemoryFile, onCancel: handleCancel }) }),
    /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "Learn more: ",
      /* @__PURE__ */ jsx(Link, { url: "https://code.claude.com/docs/en/memory" })
    ] }) })
  ] }) });
}
const call = async (onDone) => {
  clearMemoryFileCaches();
  await getMemoryFiles();
  return /* @__PURE__ */ jsx(MemoryCommand, { onDone });
};
export {
  call
};
