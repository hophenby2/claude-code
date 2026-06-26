import { randomUUID } from "crypto";
import { basename } from "path";
import { useEffect, useMemo, useRef, useState } from "react";
import { logEvent } from "../services/analytics/index.js";
import { readFileSync } from "../utils/fileRead.js";
import { expandPath } from "../utils/path.js";
import {
  getEditsForPatch,
  getPatchForEdits
} from "../tools/FileEditTool/utils.js";
import { getGlobalConfig } from "../utils/config.js";
import { getPatchFromContents } from "../utils/diff.js";
import { isENOENT } from "../utils/errors.js";
import {
  callIdeRpc,
  getConnectedIdeClient,
  getConnectedIdeName,
  hasAccessToIDEExtensionDiffFeature
} from "../utils/ide.js";
import { WindowsToWSLConverter } from "../utils/idePathConversion.js";
import { logError } from "../utils/log.js";
import { getPlatform } from "../utils/platform.js";
function useDiffInIDE({
  onChange,
  toolUseContext,
  filePath,
  edits,
  editMode
}) {
  const isUnmounted = useRef(false);
  const [hasError, setHasError] = useState(false);
  const sha = useMemo(() => randomUUID().slice(0, 6), []);
  const tabName = useMemo(
    () => `\u273B [Claude Code] ${basename(filePath)} (${sha}) \u29C9`,
    [filePath, sha]
  );
  const shouldShowDiffInIDE = hasAccessToIDEExtensionDiffFeature(toolUseContext.options.mcpClients) && getGlobalConfig().diffTool === "auto" && // Diffs should only be for file edits.
  // File writes may come through here but are not supported for diffs.
  !filePath.endsWith(".ipynb");
  const ideName = getConnectedIdeName(toolUseContext.options.mcpClients) ?? "IDE";
  async function showDiff() {
    if (!shouldShowDiffInIDE) {
      return;
    }
    try {
      logEvent("tengu_ext_will_show_diff", {});
      const { oldContent, newContent } = await showDiffInIDE(
        filePath,
        edits,
        toolUseContext,
        tabName
      );
      if (isUnmounted.current) {
        return;
      }
      logEvent("tengu_ext_diff_accepted", {});
      const newEdits = computeEditsFromContents(
        filePath,
        oldContent,
        newContent,
        editMode
      );
      if (newEdits.length === 0) {
        logEvent("tengu_ext_diff_rejected", {});
        const ideClient = getConnectedIdeClient(
          toolUseContext.options.mcpClients
        );
        if (ideClient) {
          await closeTabInIDE(tabName, ideClient);
        }
        onChange(
          { type: "reject" },
          {
            file_path: filePath,
            edits
          }
        );
        return;
      }
      onChange(
        { type: "accept-once" },
        {
          file_path: filePath,
          edits: newEdits
        }
      );
    } catch (error) {
      logError(error);
      setHasError(true);
    }
  }
  useEffect(() => {
    void showDiff();
    return () => {
      isUnmounted.current = true;
    };
  }, []);
  return {
    closeTabInIDE() {
      const ideClient = getConnectedIdeClient(toolUseContext.options.mcpClients);
      if (!ideClient) {
        return Promise.resolve();
      }
      return closeTabInIDE(tabName, ideClient);
    },
    showingDiffInIDE: shouldShowDiffInIDE && !hasError,
    ideName,
    hasError
  };
}
function computeEditsFromContents(filePath, oldContent, newContent, editMode) {
  const singleHunk = editMode === "single";
  const patch = getPatchFromContents({
    filePath,
    oldContent,
    newContent,
    singleHunk
  });
  if (patch.length === 0) {
    return [];
  }
  if (singleHunk && patch.length > 1) {
    logError(
      new Error(
        `Unexpected number of hunks: ${patch.length}. Expected 1 hunk.`
      )
    );
  }
  return getEditsForPatch(patch);
}
async function showDiffInIDE(file_path, edits, toolUseContext, tabName) {
  let isCleanedUp = false;
  const oldFilePath = expandPath(file_path);
  let oldContent = "";
  try {
    oldContent = readFileSync(oldFilePath);
  } catch (e) {
    if (!isENOENT(e)) {
      throw e;
    }
  }
  async function cleanup() {
    if (isCleanedUp) {
      return;
    }
    isCleanedUp = true;
    try {
      await closeTabInIDE(tabName, ideClient);
    } catch (e) {
      logError(e);
    }
    process.off("beforeExit", cleanup);
    toolUseContext.abortController.signal.removeEventListener("abort", cleanup);
  }
  toolUseContext.abortController.signal.addEventListener("abort", cleanup);
  process.on("beforeExit", cleanup);
  const ideClient = getConnectedIdeClient(toolUseContext.options.mcpClients);
  try {
    const { updatedFile } = getPatchForEdits({
      filePath: oldFilePath,
      fileContents: oldContent,
      edits
    });
    if (!ideClient || ideClient.type !== "connected") {
      throw new Error("IDE client not available");
    }
    let ideOldPath = oldFilePath;
    const ideRunningInWindows = ideClient.config.ideRunningInWindows === true;
    if (getPlatform() === "wsl" && ideRunningInWindows && process.env.WSL_DISTRO_NAME) {
      const converter = new WindowsToWSLConverter(process.env.WSL_DISTRO_NAME);
      ideOldPath = converter.toIDEPath(oldFilePath);
    }
    const rpcResult = await callIdeRpc(
      "openDiff",
      {
        old_file_path: ideOldPath,
        new_file_path: ideOldPath,
        new_file_contents: updatedFile,
        tab_name: tabName
      },
      ideClient
    );
    const data = Array.isArray(rpcResult) ? rpcResult : [rpcResult];
    if (isSaveMessage(data)) {
      void cleanup();
      return {
        oldContent,
        newContent: data[1].text
      };
    } else if (isClosedMessage(data)) {
      void cleanup();
      return {
        oldContent,
        newContent: updatedFile
      };
    } else if (isRejectedMessage(data)) {
      void cleanup();
      return {
        oldContent,
        newContent: oldContent
      };
    }
    throw new Error("Not accepted");
  } catch (error) {
    logError(error);
    void cleanup();
    throw error;
  }
}
async function closeTabInIDE(tabName, ideClient) {
  try {
    if (!ideClient || ideClient.type !== "connected") {
      throw new Error("IDE client not available");
    }
    await callIdeRpc("close_tab", { tab_name: tabName }, ideClient);
  } catch (error) {
    logError(error);
  }
}
function isClosedMessage(data) {
  return Array.isArray(data) && typeof data[0] === "object" && data[0] !== null && "type" in data[0] && data[0].type === "text" && "text" in data[0] && data[0].text === "TAB_CLOSED";
}
function isRejectedMessage(data) {
  return Array.isArray(data) && typeof data[0] === "object" && data[0] !== null && "type" in data[0] && data[0].type === "text" && "text" in data[0] && data[0].text === "DIFF_REJECTED";
}
function isSaveMessage(data) {
  return Array.isArray(data) && data[0]?.type === "text" && data[0].text === "FILE_SAVED" && typeof data[1].text === "string";
}
export {
  computeEditsFromContents,
  useDiffInIDE
};
