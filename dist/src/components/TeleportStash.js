import { jsx, jsxs } from "react/jsx-runtime";
import figures from "figures";
import { useEffect, useState } from "react";
import { Box, Text } from "../ink.js";
import { logForDebugging } from "../utils/debug.js";
import { getFileStatus, stashToCleanState } from "../utils/git.js";
import { Select } from "./CustomSelect/index.js";
import { Dialog } from "./design-system/Dialog.js";
import { Spinner } from "./Spinner.js";
function TeleportStash({
  onStashAndContinue,
  onCancel
}) {
  const [gitFileStatus, setGitFileStatus] = useState(null);
  const changedFiles = gitFileStatus !== null ? [...gitFileStatus.tracked, ...gitFileStatus.untracked] : [];
  const [loading, setLoading] = useState(true);
  const [stashing, setStashing] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    const loadChangedFiles = async () => {
      try {
        const fileStatus = await getFileStatus();
        setGitFileStatus(fileStatus);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logForDebugging(`Error getting changed files: ${errorMessage}`, {
          level: "error"
        });
        setError("Failed to get changed files");
      } finally {
        setLoading(false);
      }
    };
    void loadChangedFiles();
  }, []);
  const handleStash = async () => {
    setStashing(true);
    try {
      logForDebugging("Stashing changes before teleport...");
      const success = await stashToCleanState("Teleport auto-stash");
      if (success) {
        logForDebugging("Successfully stashed changes");
        onStashAndContinue();
      } else {
        setError("Failed to stash changes");
      }
    } catch (err_0) {
      const errorMessage_0 = err_0 instanceof Error ? err_0.message : String(err_0);
      logForDebugging(`Error stashing changes: ${errorMessage_0}`, {
        level: "error"
      });
      setError("Failed to stash changes");
    } finally {
      setStashing(false);
    }
  };
  const handleSelectChange = (value) => {
    if (value === "stash") {
      void handleStash();
    } else {
      onCancel();
    }
  };
  if (loading) {
    return /* @__PURE__ */ jsx(Box, { flexDirection: "column", padding: 1, children: /* @__PURE__ */ jsxs(Box, { marginBottom: 1, children: [
      /* @__PURE__ */ jsx(Spinner, {}),
      /* @__PURE__ */ jsxs(Text, { children: [
        " Checking git status",
        figures.ellipsis
      ] })
    ] }) });
  }
  if (error) {
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", padding: 1, children: [
      /* @__PURE__ */ jsxs(Text, { bold: true, color: "error", children: [
        "Error: ",
        error
      ] }),
      /* @__PURE__ */ jsxs(Box, { marginTop: 1, children: [
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Press " }),
        /* @__PURE__ */ jsx(Text, { bold: true, children: "Escape" }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: " to cancel" })
      ] })
    ] });
  }
  const showFileCount = changedFiles.length > 8;
  return /* @__PURE__ */ jsxs(Dialog, { title: "Working Directory Has Changes", onCancel, children: [
    /* @__PURE__ */ jsx(Text, { children: "Teleport will switch git branches. The following changes were found:" }),
    /* @__PURE__ */ jsx(Box, { flexDirection: "column", paddingLeft: 2, children: changedFiles.length > 0 ? showFileCount ? /* @__PURE__ */ jsxs(Text, { children: [
      changedFiles.length,
      " files changed"
    ] }) : changedFiles.map((file, index) => /* @__PURE__ */ jsx(Text, { children: file }, index)) : /* @__PURE__ */ jsx(Text, { dimColor: true, children: "No changes detected" }) }),
    /* @__PURE__ */ jsx(Text, { children: "Would you like to stash these changes and continue with teleport?" }),
    stashing ? /* @__PURE__ */ jsxs(Box, { children: [
      /* @__PURE__ */ jsx(Spinner, {}),
      /* @__PURE__ */ jsx(Text, { children: " Stashing changes..." })
    ] }) : /* @__PURE__ */ jsx(Select, { options: [{
      label: "Stash changes and continue",
      value: "stash"
    }, {
      label: "Exit",
      value: "exit"
    }], onChange: handleSelectChange })
  ] });
}
export {
  TeleportStash
};
