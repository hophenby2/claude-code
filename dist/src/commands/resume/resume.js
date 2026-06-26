import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import chalk from "chalk";
import figures from "figures";
import * as React from "react";
import { getOriginalCwd, getSessionId } from "../../bootstrap/state.js";
import { LogSelector } from "../../components/LogSelector.js";
import { MessageResponse } from "../../components/MessageResponse.js";
import { Spinner } from "../../components/Spinner.js";
import { useIsInsideModal } from "../../context/modalContext.js";
import { useTerminalSize } from "../../hooks/useTerminalSize.js";
import { setClipboard } from "../../ink/termio/osc.js";
import { Box, Text } from "../../ink.js";
import { agenticSessionSearch } from "../../utils/agenticSessionSearch.js";
import { checkCrossProjectResume } from "../../utils/crossProjectResume.js";
import { getWorktreePaths } from "../../utils/getWorktreePaths.js";
import { logError } from "../../utils/log.js";
import { getLastSessionLog, getSessionIdFromLog, isCustomTitleEnabled, isLiteLog, loadAllProjectsMessageLogs, loadFullLog, loadSameRepoMessageLogs, searchSessionsByCustomTitle } from "../../utils/sessionStorage.js";
import { validateUuid } from "../../utils/uuid.js";
function resumeHelpMessage(result) {
  switch (result.resultType) {
    case "sessionNotFound":
      return `Session ${chalk.bold(result.arg)} was not found.`;
    case "multipleMatches":
      return `Found ${result.count} sessions matching ${chalk.bold(result.arg)}. Please use /resume to pick a specific session.`;
  }
}
function ResumeError(t0) {
  const $ = _c(10);
  const {
    message,
    args,
    onDone
  } = t0;
  let t1;
  let t2;
  if ($[0] !== onDone) {
    t1 = () => {
      const timer = setTimeout(onDone, 0);
      return () => clearTimeout(timer);
    };
    t2 = [onDone];
    $[0] = onDone;
    $[1] = t1;
    $[2] = t2;
  } else {
    t1 = $[1];
    t2 = $[2];
  }
  React.useEffect(t1, t2);
  let t3;
  if ($[3] !== args) {
    t3 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      figures.pointer,
      " /resume ",
      args
    ] });
    $[3] = args;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  let t4;
  if ($[5] !== message) {
    t4 = /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { children: message }) });
    $[5] = message;
    $[6] = t4;
  } else {
    t4 = $[6];
  }
  let t5;
  if ($[7] !== t3 || $[8] !== t4) {
    t5 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      t3,
      t4
    ] });
    $[7] = t3;
    $[8] = t4;
    $[9] = t5;
  } else {
    t5 = $[9];
  }
  return t5;
}
function ResumeCommand({
  onDone,
  onResume
}) {
  const [logs, setLogs] = React.useState([]);
  const [worktreePaths, setWorktreePaths] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [resuming, setResuming] = React.useState(false);
  const [showAllProjects, setShowAllProjects] = React.useState(false);
  const {
    rows
  } = useTerminalSize();
  const insideModal = useIsInsideModal();
  const loadLogs = React.useCallback(async (allProjects, paths) => {
    setLoading(true);
    try {
      const allLogs = allProjects ? await loadAllProjectsMessageLogs() : await loadSameRepoMessageLogs(paths);
      const resumable = filterResumableSessions(allLogs, getSessionId());
      if (resumable.length === 0) {
        onDone("No conversations found to resume");
        return;
      }
      setLogs(resumable);
    } catch (_err) {
      onDone("Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }, [onDone]);
  React.useEffect(() => {
    async function init() {
      const paths_0 = await getWorktreePaths(getOriginalCwd());
      setWorktreePaths(paths_0);
      void loadLogs(false, paths_0);
    }
    void init();
  }, [loadLogs]);
  const handleToggleAllProjects = React.useCallback(() => {
    const newValue = !showAllProjects;
    setShowAllProjects(newValue);
    void loadLogs(newValue, worktreePaths);
  }, [showAllProjects, loadLogs, worktreePaths]);
  async function handleSelect(log) {
    const sessionId = validateUuid(getSessionIdFromLog(log));
    if (!sessionId) {
      onDone("Failed to resume conversation");
      return;
    }
    const fullLog = isLiteLog(log) ? await loadFullLog(log) : log;
    const crossProjectCheck = checkCrossProjectResume(fullLog, showAllProjects, worktreePaths);
    if (crossProjectCheck.isCrossProject) {
      if (crossProjectCheck.isSameRepoWorktree) {
        setResuming(true);
        void onResume(sessionId, fullLog, "slash_command_picker");
        return;
      }
      const raw = await setClipboard(crossProjectCheck.command);
      if (raw) process.stdout.write(raw);
      const message = ["", "This conversation is from a different directory.", "", "To resume, run:", `  ${crossProjectCheck.command}`, "", "(Command copied to clipboard)", ""].join("\n");
      onDone(message, {
        display: "user"
      });
      return;
    }
    setResuming(true);
    void onResume(sessionId, fullLog, "slash_command_picker");
  }
  function handleCancel() {
    onDone("Resume cancelled", {
      display: "system"
    });
  }
  if (loading) {
    return /* @__PURE__ */ jsxs(Box, { children: [
      /* @__PURE__ */ jsx(Spinner, {}),
      /* @__PURE__ */ jsx(Text, { children: " Loading conversations\u2026" })
    ] });
  }
  if (resuming) {
    return /* @__PURE__ */ jsxs(Box, { children: [
      /* @__PURE__ */ jsx(Spinner, {}),
      /* @__PURE__ */ jsx(Text, { children: " Resuming conversation\u2026" })
    ] });
  }
  return /* @__PURE__ */ jsx(LogSelector, { logs, maxHeight: insideModal ? Math.floor(rows / 2) : rows - 2, onCancel: handleCancel, onSelect: handleSelect, onLogsChanged: () => loadLogs(showAllProjects, worktreePaths), showAllProjects, onToggleAllProjects: handleToggleAllProjects, onAgenticSearch: agenticSessionSearch });
}
function filterResumableSessions(logs, currentSessionId) {
  return logs.filter((l) => !l.isSidechain && getSessionIdFromLog(l) !== currentSessionId);
}
const call = async (onDone, context, args) => {
  const onResume = async (sessionId, log, entrypoint) => {
    try {
      await context.resume?.(sessionId, log, entrypoint);
      onDone(void 0, {
        display: "skip"
      });
    } catch (error) {
      logError(error);
      onDone(`Failed to resume: ${error.message}`);
    }
  };
  const arg = args?.trim();
  if (!arg) {
    return /* @__PURE__ */ jsx(ResumeCommand, { onDone, onResume }, Date.now());
  }
  const worktreePaths = await getWorktreePaths(getOriginalCwd());
  const logs = await loadSameRepoMessageLogs(worktreePaths);
  if (logs.length === 0) {
    const message2 = "No conversations found to resume.";
    return /* @__PURE__ */ jsx(ResumeError, { message: message2, args: arg, onDone: () => onDone(message2) });
  }
  const maybeSessionId = validateUuid(arg);
  if (maybeSessionId) {
    const matchingLogs = logs.filter((l) => getSessionIdFromLog(l) === maybeSessionId).sort((a, b) => b.modified.getTime() - a.modified.getTime());
    if (matchingLogs.length > 0) {
      const log = matchingLogs[0];
      const fullLog = isLiteLog(log) ? await loadFullLog(log) : log;
      void onResume(maybeSessionId, fullLog, "slash_command_session_id");
      return null;
    }
    const directLog = await getLastSessionLog(maybeSessionId);
    if (directLog) {
      void onResume(maybeSessionId, directLog, "slash_command_session_id");
      return null;
    }
  }
  if (isCustomTitleEnabled()) {
    const titleMatches = await searchSessionsByCustomTitle(arg, {
      exact: true
    });
    if (titleMatches.length === 1) {
      const log = titleMatches[0];
      const sessionId = getSessionIdFromLog(log);
      if (sessionId) {
        const fullLog = isLiteLog(log) ? await loadFullLog(log) : log;
        void onResume(sessionId, fullLog, "slash_command_title");
        return null;
      }
    }
    if (titleMatches.length > 1) {
      const message2 = resumeHelpMessage({
        resultType: "multipleMatches",
        arg,
        count: titleMatches.length
      });
      return /* @__PURE__ */ jsx(ResumeError, { message: message2, args: arg, onDone: () => onDone(message2) });
    }
  }
  const message = resumeHelpMessage({
    resultType: "sessionNotFound",
    arg
  });
  return /* @__PURE__ */ jsx(ResumeError, { message, args: arg, onDone: () => onDone(message) });
};
export {
  call,
  filterResumableSessions
};
