import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import chalk from "chalk";
import * as path from "path";
import { useCallback, useEffect, useRef, useState } from "react";
import { logEvent } from "../../services/analytics/index.js";
import { Select } from "../../components/CustomSelect/index.js";
import { Dialog } from "../../components/design-system/Dialog.js";
import { IdeAutoConnectDialog, IdeDisableAutoConnectDialog, shouldShowAutoConnectDialog, shouldShowDisableAutoConnectDialog } from "../../components/IdeAutoConnectDialog.js";
import { Box, Text } from "../../ink.js";
import { clearServerCache } from "../../services/mcp/client.js";
import { useAppState, useSetAppState } from "../../state/AppState.js";
import { getCwd } from "../../utils/cwd.js";
import { execFileNoThrow } from "../../utils/execFileNoThrow.js";
import { detectIDEs, detectRunningIDEs, isJetBrainsIde, isSupportedJetBrainsTerminal, isSupportedTerminal, toIDEDisplayName } from "../../utils/ide.js";
import { getCurrentWorktreeSession } from "../../utils/worktree.js";
function IDEScreen(t0) {
  const $ = _c(39);
  const {
    availableIDEs,
    unavailableIDEs,
    selectedIDE,
    onClose,
    onSelect
  } = t0;
  let t1;
  if ($[0] !== selectedIDE?.port) {
    t1 = selectedIDE?.port?.toString() ?? "None";
    $[0] = selectedIDE?.port;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const [selectedValue, setSelectedValue] = useState(t1);
  const [showAutoConnectDialog, setShowAutoConnectDialog] = useState(false);
  const [showDisableAutoConnectDialog, setShowDisableAutoConnectDialog] = useState(false);
  let t2;
  if ($[2] !== availableIDEs || $[3] !== onSelect) {
    t2 = (value) => {
      if (value !== "None" && shouldShowAutoConnectDialog()) {
        setShowAutoConnectDialog(true);
      } else {
        if (value === "None" && shouldShowDisableAutoConnectDialog()) {
          setShowDisableAutoConnectDialog(true);
        } else {
          onSelect(availableIDEs.find((ide) => ide.port === parseInt(value)));
        }
      }
    };
    $[2] = availableIDEs;
    $[3] = onSelect;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  const handleSelectIDE = t2;
  let t3;
  if ($[5] !== availableIDEs) {
    t3 = availableIDEs.reduce(_temp, {});
    $[5] = availableIDEs;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  const ideCounts = t3;
  let t4;
  if ($[7] !== availableIDEs || $[8] !== ideCounts) {
    let t52;
    if ($[10] !== ideCounts) {
      t52 = (ide_1) => {
        const hasMultipleInstances = (ideCounts[ide_1.name] || 0) > 1;
        const showWorkspace = hasMultipleInstances && ide_1.workspaceFolders.length > 0;
        return {
          label: ide_1.name,
          value: ide_1.port.toString(),
          description: showWorkspace ? formatWorkspaceFolders(ide_1.workspaceFolders) : void 0
        };
      };
      $[10] = ideCounts;
      $[11] = t52;
    } else {
      t52 = $[11];
    }
    t4 = availableIDEs.map(t52).concat([{
      label: "None",
      value: "None",
      description: void 0
    }]);
    $[7] = availableIDEs;
    $[8] = ideCounts;
    $[9] = t4;
  } else {
    t4 = $[9];
  }
  const options = t4;
  if (showAutoConnectDialog) {
    let t52;
    if ($[12] !== handleSelectIDE || $[13] !== selectedValue) {
      t52 = /* @__PURE__ */ jsx(IdeAutoConnectDialog, { onComplete: () => handleSelectIDE(selectedValue) });
      $[12] = handleSelectIDE;
      $[13] = selectedValue;
      $[14] = t52;
    } else {
      t52 = $[14];
    }
    return t52;
  }
  if (showDisableAutoConnectDialog) {
    let t52;
    if ($[15] !== onSelect) {
      t52 = /* @__PURE__ */ jsx(IdeDisableAutoConnectDialog, { onComplete: () => {
        onSelect(void 0);
      } });
      $[15] = onSelect;
      $[16] = t52;
    } else {
      t52 = $[16];
    }
    return t52;
  }
  let t5;
  if ($[17] !== availableIDEs.length) {
    t5 = availableIDEs.length === 0 && /* @__PURE__ */ jsx(Text, { dimColor: true, children: isSupportedJetBrainsTerminal() ? "No available IDEs detected. Please install the plugin and restart your IDE:\nhttps://docs.claude.com/s/claude-code-jetbrains" : "No available IDEs detected. Make sure your IDE has the Claude Code extension or plugin installed and is running." });
    $[17] = availableIDEs.length;
    $[18] = t5;
  } else {
    t5 = $[18];
  }
  let t6;
  if ($[19] !== availableIDEs.length || $[20] !== handleSelectIDE || $[21] !== options || $[22] !== selectedValue) {
    t6 = availableIDEs.length !== 0 && /* @__PURE__ */ jsx(Select, { defaultValue: selectedValue, defaultFocusValue: selectedValue, options, onChange: (value_0) => {
      setSelectedValue(value_0);
      handleSelectIDE(value_0);
    } });
    $[19] = availableIDEs.length;
    $[20] = handleSelectIDE;
    $[21] = options;
    $[22] = selectedValue;
    $[23] = t6;
  } else {
    t6 = $[23];
  }
  let t7;
  if ($[24] !== availableIDEs) {
    t7 = availableIDEs.length !== 0 && availableIDEs.some(_temp2) && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { color: "warning", children: "Note: Only one Claude Code instance can be connected to VS Code at a time." }) });
    $[24] = availableIDEs;
    $[25] = t7;
  } else {
    t7 = $[25];
  }
  let t8;
  if ($[26] !== availableIDEs.length) {
    t8 = availableIDEs.length !== 0 && !isSupportedTerminal() && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Tip: You can enable auto-connect to IDE in /config or with the --ide flag" }) });
    $[26] = availableIDEs.length;
    $[27] = t8;
  } else {
    t8 = $[27];
  }
  let t9;
  if ($[28] !== unavailableIDEs) {
    t9 = unavailableIDEs.length > 0 && /* @__PURE__ */ jsxs(Box, { marginTop: 1, flexDirection: "column", children: [
      /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "Found ",
        unavailableIDEs.length,
        " other running IDE(s). However, their workspace/project directories do not match the current cwd."
      ] }),
      /* @__PURE__ */ jsx(Box, { marginTop: 1, flexDirection: "column", children: unavailableIDEs.map(_temp3) })
    ] });
    $[28] = unavailableIDEs;
    $[29] = t9;
  } else {
    t9 = $[29];
  }
  let t10;
  if ($[30] !== t5 || $[31] !== t6 || $[32] !== t7 || $[33] !== t8 || $[34] !== t9) {
    t10 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      t5,
      t6,
      t7,
      t8,
      t9
    ] });
    $[30] = t5;
    $[31] = t6;
    $[32] = t7;
    $[33] = t8;
    $[34] = t9;
    $[35] = t10;
  } else {
    t10 = $[35];
  }
  let t11;
  if ($[36] !== onClose || $[37] !== t10) {
    t11 = /* @__PURE__ */ jsx(Dialog, { title: "Select IDE", subtitle: "Connect to an IDE for integrated development features.", onCancel: onClose, color: "ide", children: t10 });
    $[36] = onClose;
    $[37] = t10;
    $[38] = t11;
  } else {
    t11 = $[38];
  }
  return t11;
}
function _temp3(ide_3, index) {
  return /* @__PURE__ */ jsx(Box, { paddingLeft: 3, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
    "\u2022 ",
    ide_3.name,
    ": ",
    formatWorkspaceFolders(ide_3.workspaceFolders)
  ] }) }, index);
}
function _temp2(ide_2) {
  return ide_2.name === "VS Code" || ide_2.name === "Visual Studio Code";
}
function _temp(acc, ide_0) {
  acc[ide_0.name] = (acc[ide_0.name] || 0) + 1;
  return acc;
}
async function findCurrentIDE(availableIDEs, dynamicMcpConfig) {
  const currentConfig = dynamicMcpConfig?.ide;
  if (!currentConfig || currentConfig.type !== "sse-ide" && currentConfig.type !== "ws-ide") {
    return null;
  }
  for (const ide of availableIDEs) {
    if (ide.url === currentConfig.url) {
      return ide;
    }
  }
  return null;
}
function IDEOpenSelection(t0) {
  const $ = _c(18);
  const {
    availableIDEs,
    onSelectIDE,
    onDone
  } = t0;
  let t1;
  if ($[0] !== availableIDEs[0]?.port) {
    t1 = availableIDEs[0]?.port?.toString() ?? "";
    $[0] = availableIDEs[0]?.port;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const [selectedValue, setSelectedValue] = useState(t1);
  let t2;
  if ($[2] !== availableIDEs || $[3] !== onSelectIDE) {
    t2 = (value) => {
      const selectedIDE = availableIDEs.find((ide) => ide.port === parseInt(value));
      onSelectIDE(selectedIDE);
    };
    $[2] = availableIDEs;
    $[3] = onSelectIDE;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  const handleSelectIDE = t2;
  let t3;
  if ($[5] !== availableIDEs) {
    t3 = availableIDEs.map(_temp4);
    $[5] = availableIDEs;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  const options = t3;
  let t4;
  if ($[7] !== onDone) {
    t4 = function handleCancel2() {
      onDone("IDE selection cancelled", {
        display: "system"
      });
    };
    $[7] = onDone;
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  const handleCancel = t4;
  let t5;
  if ($[9] !== handleSelectIDE) {
    t5 = (value_0) => {
      setSelectedValue(value_0);
      handleSelectIDE(value_0);
    };
    $[9] = handleSelectIDE;
    $[10] = t5;
  } else {
    t5 = $[10];
  }
  let t6;
  if ($[11] !== options || $[12] !== selectedValue || $[13] !== t5) {
    t6 = /* @__PURE__ */ jsx(Select, { defaultValue: selectedValue, defaultFocusValue: selectedValue, options, onChange: t5 });
    $[11] = options;
    $[12] = selectedValue;
    $[13] = t5;
    $[14] = t6;
  } else {
    t6 = $[14];
  }
  let t7;
  if ($[15] !== handleCancel || $[16] !== t6) {
    t7 = /* @__PURE__ */ jsx(Dialog, { title: "Select an IDE to open the project", onCancel: handleCancel, color: "ide", children: t6 });
    $[15] = handleCancel;
    $[16] = t6;
    $[17] = t7;
  } else {
    t7 = $[17];
  }
  return t7;
}
function _temp4(ide_0) {
  return {
    label: ide_0.name,
    value: ide_0.port.toString()
  };
}
function RunningIDESelector(t0) {
  const $ = _c(15);
  const {
    runningIDEs,
    onSelectIDE,
    onDone
  } = t0;
  const [selectedValue, setSelectedValue] = useState(runningIDEs[0] ?? "");
  let t1;
  if ($[0] !== onSelectIDE) {
    t1 = (value) => {
      onSelectIDE(value);
    };
    $[0] = onSelectIDE;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const handleSelectIDE = t1;
  let t2;
  if ($[2] !== runningIDEs) {
    t2 = runningIDEs.map(_temp5);
    $[2] = runningIDEs;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  const options = t2;
  let t3;
  if ($[4] !== onDone) {
    t3 = function handleCancel2() {
      onDone("IDE selection cancelled", {
        display: "system"
      });
    };
    $[4] = onDone;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  const handleCancel = t3;
  let t4;
  if ($[6] !== handleSelectIDE) {
    t4 = (value_0) => {
      setSelectedValue(value_0);
      handleSelectIDE(value_0);
    };
    $[6] = handleSelectIDE;
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  let t5;
  if ($[8] !== options || $[9] !== selectedValue || $[10] !== t4) {
    t5 = /* @__PURE__ */ jsx(Select, { defaultFocusValue: selectedValue, options, onChange: t4 });
    $[8] = options;
    $[9] = selectedValue;
    $[10] = t4;
    $[11] = t5;
  } else {
    t5 = $[11];
  }
  let t6;
  if ($[12] !== handleCancel || $[13] !== t5) {
    t6 = /* @__PURE__ */ jsx(Dialog, { title: "Select IDE to install extension", onCancel: handleCancel, color: "ide", children: t5 });
    $[12] = handleCancel;
    $[13] = t5;
    $[14] = t6;
  } else {
    t6 = $[14];
  }
  return t6;
}
function _temp5(ide) {
  return {
    label: toIDEDisplayName(ide),
    value: ide
  };
}
function InstallOnMount(t0) {
  const $ = _c(4);
  const {
    ide,
    onInstall
  } = t0;
  let t1;
  let t2;
  if ($[0] !== ide || $[1] !== onInstall) {
    t1 = () => {
      onInstall(ide);
    };
    t2 = [ide, onInstall];
    $[0] = ide;
    $[1] = onInstall;
    $[2] = t1;
    $[3] = t2;
  } else {
    t1 = $[2];
    t2 = $[3];
  }
  useEffect(t1, t2);
  return null;
}
async function call(onDone, context, args) {
  logEvent("tengu_ext_ide_command", {});
  const {
    options: {
      dynamicMcpConfig
    },
    onChangeDynamicMcpConfig
  } = context;
  if (args?.trim() === "open") {
    const worktreeSession = getCurrentWorktreeSession();
    const targetPath = worktreeSession ? worktreeSession.worktreePath : getCwd();
    const detectedIDEs2 = await detectIDEs(true);
    const availableIDEs2 = detectedIDEs2.filter((ide) => ide.isValid);
    if (availableIDEs2.length === 0) {
      onDone("No IDEs with Claude Code extension detected.");
      return null;
    }
    return /* @__PURE__ */ jsx(IDEOpenSelection, { availableIDEs: availableIDEs2, onSelectIDE: async (selectedIDE) => {
      if (!selectedIDE) {
        onDone("No IDE selected.");
        return;
      }
      if (selectedIDE.name.toLowerCase().includes("vscode") || selectedIDE.name.toLowerCase().includes("cursor") || selectedIDE.name.toLowerCase().includes("windsurf")) {
        const {
          code
        } = await execFileNoThrow("code", [targetPath]);
        if (code === 0) {
          onDone(`Opened ${worktreeSession ? "worktree" : "project"} in ${chalk.bold(selectedIDE.name)}`);
        } else {
          onDone(`Failed to open in ${selectedIDE.name}. Try opening manually: ${targetPath}`);
        }
      } else if (isSupportedJetBrainsTerminal()) {
        onDone(`Please open the ${worktreeSession ? "worktree" : "project"} manually in ${chalk.bold(selectedIDE.name)}: ${targetPath}`);
      } else {
        onDone(`Please open the ${worktreeSession ? "worktree" : "project"} manually in ${chalk.bold(selectedIDE.name)}: ${targetPath}`);
      }
    }, onDone: () => {
      onDone("Exited without opening IDE", {
        display: "system"
      });
    } });
  }
  const detectedIDEs = await detectIDEs(true);
  if (detectedIDEs.length === 0 && context.onInstallIDEExtension && !isSupportedTerminal()) {
    const runningIDEs = await detectRunningIDEs();
    const onInstall = (ide) => {
      if (context.onInstallIDEExtension) {
        context.onInstallIDEExtension(ide);
        if (isJetBrainsIde(ide)) {
          onDone(`Installed plugin to ${chalk.bold(toIDEDisplayName(ide))}
Please ${chalk.bold("restart your IDE")} completely for it to take effect`);
        } else {
          onDone(`Installed extension to ${chalk.bold(toIDEDisplayName(ide))}`);
        }
      }
    };
    if (runningIDEs.length > 1) {
      return /* @__PURE__ */ jsx(RunningIDESelector, { runningIDEs, onSelectIDE: onInstall, onDone: () => {
        onDone("No IDE selected.", {
          display: "system"
        });
      } });
    } else if (runningIDEs.length === 1) {
      return /* @__PURE__ */ jsx(InstallOnMount, { ide: runningIDEs[0], onInstall });
    }
  }
  const availableIDEs = detectedIDEs.filter((ide) => ide.isValid);
  const unavailableIDEs = detectedIDEs.filter((ide) => !ide.isValid);
  const currentIDE = await findCurrentIDE(availableIDEs, dynamicMcpConfig);
  return /* @__PURE__ */ jsx(IDECommandFlow, { availableIDEs, unavailableIDEs, currentIDE, dynamicMcpConfig, onChangeDynamicMcpConfig, onDone });
}
const IDE_CONNECTION_TIMEOUT_MS = 35e3;
function IDECommandFlow({
  availableIDEs,
  unavailableIDEs,
  currentIDE,
  dynamicMcpConfig,
  onChangeDynamicMcpConfig,
  onDone
}) {
  const [connectingIDE, setConnectingIDE] = useState(null);
  const ideClient = useAppState((s) => s.mcp.clients.find((c) => c.name === "ide"));
  const setAppState = useSetAppState();
  const isFirstCheckRef = useRef(true);
  useEffect(() => {
    if (!connectingIDE) return;
    if (isFirstCheckRef.current) {
      isFirstCheckRef.current = false;
      return;
    }
    if (!ideClient || ideClient.type === "pending") return;
    if (ideClient.type === "connected") {
      onDone(`Connected to ${connectingIDE.name}.`);
    } else if (ideClient.type === "failed") {
      onDone(`Failed to connect to ${connectingIDE.name}.`);
    }
  }, [ideClient, connectingIDE, onDone]);
  useEffect(() => {
    if (!connectingIDE) return;
    const timer = setTimeout(onDone, IDE_CONNECTION_TIMEOUT_MS, `Connection to ${connectingIDE.name} timed out.`);
    return () => clearTimeout(timer);
  }, [connectingIDE, onDone]);
  const handleSelectIDE = useCallback((selectedIDE) => {
    if (!onChangeDynamicMcpConfig) {
      onDone("Error connecting to IDE.");
      return;
    }
    const newConfig = {
      ...dynamicMcpConfig || {}
    };
    if (currentIDE) {
      delete newConfig.ide;
    }
    if (!selectedIDE) {
      if (ideClient && ideClient.type === "connected" && currentIDE) {
        ideClient.client.onclose = () => {
        };
        void clearServerCache("ide", ideClient.config);
        setAppState((prev) => ({
          ...prev,
          mcp: {
            ...prev.mcp,
            clients: prev.mcp.clients.filter((c_0) => c_0.name !== "ide"),
            tools: prev.mcp.tools.filter((t) => !t.name?.startsWith("mcp__ide__")),
            commands: prev.mcp.commands.filter((c_1) => !c_1.name?.startsWith("mcp__ide__"))
          }
        }));
      }
      onChangeDynamicMcpConfig(newConfig);
      onDone(currentIDE ? `Disconnected from ${currentIDE.name}.` : "No IDE selected.");
      return;
    }
    const url = selectedIDE.url;
    newConfig.ide = {
      type: url.startsWith("ws:") ? "ws-ide" : "sse-ide",
      url,
      ideName: selectedIDE.name,
      authToken: selectedIDE.authToken,
      ideRunningInWindows: selectedIDE.ideRunningInWindows,
      scope: "dynamic"
    };
    isFirstCheckRef.current = true;
    setConnectingIDE(selectedIDE);
    onChangeDynamicMcpConfig(newConfig);
  }, [dynamicMcpConfig, currentIDE, ideClient, setAppState, onChangeDynamicMcpConfig, onDone]);
  if (connectingIDE) {
    return /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "Connecting to ",
      connectingIDE.name,
      "\u2026"
    ] });
  }
  return /* @__PURE__ */ jsx(IDEScreen, { availableIDEs, unavailableIDEs, selectedIDE: currentIDE, onClose: () => onDone("IDE selection cancelled", {
    display: "system"
  }), onSelect: handleSelectIDE });
}
function formatWorkspaceFolders(folders, maxLength = 100) {
  if (folders.length === 0) return "";
  const cwd = getCwd();
  const foldersToShow = folders.slice(0, 2);
  const hasMore = folders.length > 2;
  const ellipsisOverhead = hasMore ? 3 : 0;
  const separatorOverhead = (foldersToShow.length - 1) * 2;
  const availableLength = maxLength - separatorOverhead - ellipsisOverhead;
  const maxLengthPerPath = Math.floor(availableLength / foldersToShow.length);
  const cwdNFC = cwd.normalize("NFC");
  const formattedFolders = foldersToShow.map((folder) => {
    const folderNFC = folder.normalize("NFC");
    if (folderNFC.startsWith(cwdNFC + path.sep)) {
      folder = folderNFC.slice(cwdNFC.length + 1);
    }
    if (folder.length <= maxLengthPerPath) {
      return folder;
    }
    return "\u2026" + folder.slice(-(maxLengthPerPath - 1));
  });
  let result = formattedFolders.join(", ");
  if (hasMore) {
    result += ", \u2026";
  }
  return result;
}
export {
  call,
  formatWorkspaceFolders
};
