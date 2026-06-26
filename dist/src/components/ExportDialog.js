import { jsx, jsxs } from "react/jsx-runtime";
import { join } from "path";
import { useCallback, useState } from "react";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { setClipboard } from "../ink/termio/osc.js";
import { Box, Text } from "../ink.js";
import { useKeybinding } from "../keybindings/useKeybinding.js";
import { getCwd } from "../utils/cwd.js";
import { writeFileSync_DEPRECATED } from "../utils/slowOperations.js";
import { ConfigurableShortcutHint } from "./ConfigurableShortcutHint.js";
import { Select } from "./CustomSelect/select.js";
import { Byline } from "./design-system/Byline.js";
import { Dialog } from "./design-system/Dialog.js";
import { KeyboardShortcutHint } from "./design-system/KeyboardShortcutHint.js";
import TextInput from "./TextInput.js";
function ExportDialog({
  content,
  defaultFilename,
  onDone
}) {
  const [, setSelectedOption] = useState(null);
  const [filename, setFilename] = useState(defaultFilename);
  const [cursorOffset, setCursorOffset] = useState(defaultFilename.length);
  const [showFilenameInput, setShowFilenameInput] = useState(false);
  const {
    columns
  } = useTerminalSize();
  const handleGoBack = useCallback(() => {
    setShowFilenameInput(false);
    setSelectedOption(null);
  }, []);
  const handleSelectOption = async (value) => {
    if (value === "clipboard") {
      const raw = await setClipboard(content);
      if (raw) process.stdout.write(raw);
      onDone({
        success: true,
        message: "Conversation copied to clipboard"
      });
    } else if (value === "file") {
      setSelectedOption("file");
      setShowFilenameInput(true);
    }
  };
  const handleFilenameSubmit = () => {
    const finalFilename = filename.endsWith(".txt") ? filename : filename.replace(/\.[^.]+$/, "") + ".txt";
    const filepath = join(getCwd(), finalFilename);
    try {
      writeFileSync_DEPRECATED(filepath, content, {
        encoding: "utf-8",
        flush: true
      });
      onDone({
        success: true,
        message: `Conversation exported to: ${filepath}`
      });
    } catch (error) {
      onDone({
        success: false,
        message: `Failed to export conversation: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }
  };
  const handleCancel = useCallback(() => {
    if (showFilenameInput) {
      handleGoBack();
    } else {
      onDone({
        success: false,
        message: "Export cancelled"
      });
    }
  }, [showFilenameInput, handleGoBack, onDone]);
  const options = [{
    label: "Copy to clipboard",
    value: "clipboard",
    description: "Copy the conversation to your system clipboard"
  }, {
    label: "Save to file",
    value: "file",
    description: "Save the conversation to a file in the current directory"
  }];
  function renderInputGuide(exitState) {
    if (showFilenameInput) {
      return /* @__PURE__ */ jsxs(Byline, { children: [
        /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Enter", action: "save" }),
        /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "go back" })
      ] });
    }
    if (exitState.pending) {
      return /* @__PURE__ */ jsxs(Text, { children: [
        "Press ",
        exitState.keyName,
        " again to exit"
      ] });
    }
    return /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "cancel" });
  }
  useKeybinding("confirm:no", handleCancel, {
    context: "Settings",
    isActive: showFilenameInput
  });
  return /* @__PURE__ */ jsx(Dialog, { title: "Export Conversation", subtitle: "Select export method:", color: "permission", onCancel: handleCancel, inputGuide: renderInputGuide, isCancelActive: !showFilenameInput, children: !showFilenameInput ? /* @__PURE__ */ jsx(Select, { options, onChange: handleSelectOption, onCancel: handleCancel }) : /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx(Text, { children: "Enter filename:" }),
    /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 1, marginTop: 1, children: [
      /* @__PURE__ */ jsx(Text, { children: ">" }),
      /* @__PURE__ */ jsx(TextInput, { value: filename, onChange: setFilename, onSubmit: handleFilenameSubmit, focus: true, showCursor: true, columns, cursorOffset, onChangeCursorOffset: setCursorOffset })
    ] })
  ] }) });
}
export {
  ExportDialog
};
