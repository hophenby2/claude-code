import { jsx, jsxs } from "react/jsx-runtime";
import { useCallback, useState } from "react";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { fetchCodeSessionsFromSessionsAPI } from "../utils/teleport/api.js";
import { Box, Text, useInput } from "../ink.js";
import { useKeybinding } from "../keybindings/useKeybinding.js";
import { useShortcutDisplay } from "../keybindings/useShortcutDisplay.js";
import { logForDebugging } from "../utils/debug.js";
import { detectCurrentRepository } from "../utils/detectRepository.js";
import { formatRelativeTime } from "../utils/format.js";
import { ConfigurableShortcutHint } from "./ConfigurableShortcutHint.js";
import { Select } from "./CustomSelect/index.js";
import { Byline } from "./design-system/Byline.js";
import { KeyboardShortcutHint } from "./design-system/KeyboardShortcutHint.js";
import { Spinner } from "./Spinner.js";
import { TeleportError } from "./TeleportError.js";
const UPDATED_STRING = "Updated";
const SPACE_BETWEEN_TABLE_COLUMNS = "  ";
function ResumeTask({
  onSelect,
  onCancel,
  isEmbedded = false
}) {
  const {
    rows
  } = useTerminalSize();
  const [sessions, setSessions] = useState([]);
  const [currentRepo, setCurrentRepo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErrorType, setLoadErrorType] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [hasCompletedTeleportErrorFlow, setHasCompletedTeleportErrorFlow] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(1);
  const escKey = useShortcutDisplay("confirm:no", "Confirmation", "Esc");
  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      setLoadErrorType(null);
      const detectedRepo = await detectCurrentRepository();
      setCurrentRepo(detectedRepo);
      logForDebugging(`Current repository: ${detectedRepo || "not detected"}`);
      const codeSessions = await fetchCodeSessionsFromSessionsAPI();
      let filteredSessions = codeSessions;
      if (detectedRepo) {
        filteredSessions = codeSessions.filter((session) => {
          if (!session.repo) return false;
          const sessionRepo = `${session.repo.owner.login}/${session.repo.name}`;
          return sessionRepo === detectedRepo;
        });
        logForDebugging(`Filtered ${filteredSessions.length} sessions for repo ${detectedRepo} from ${codeSessions.length} total`);
      }
      const sortedSessions = [...filteredSessions].sort((a, b) => {
        const dateA = new Date(a.updated_at);
        const dateB = new Date(b.updated_at);
        return dateB.getTime() - dateA.getTime();
      });
      setSessions(sortedSessions);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logForDebugging(`Error loading code sessions: ${errorMessage}`);
      setLoadErrorType(determineErrorType(errorMessage));
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  }, []);
  const handleRetry = () => {
    setRetrying(true);
    void loadSessions();
  };
  useKeybinding("confirm:no", onCancel, {
    context: "Confirmation"
  });
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      onCancel();
      return;
    }
    if (key.ctrl && input === "r" && loadErrorType) {
      handleRetry();
      return;
    }
    if (loadErrorType !== null && key.return) {
      onCancel();
      return;
    }
  });
  const handleErrorComplete = useCallback(() => {
    setHasCompletedTeleportErrorFlow(true);
    void loadSessions();
  }, [setHasCompletedTeleportErrorFlow, loadSessions]);
  if (!hasCompletedTeleportErrorFlow) {
    return /* @__PURE__ */ jsx(TeleportError, { onComplete: handleErrorComplete });
  }
  if (loading) {
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", padding: 1, children: [
      /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
        /* @__PURE__ */ jsx(Spinner, {}),
        /* @__PURE__ */ jsx(Text, { bold: true, children: "Loading Claude Code sessions\u2026" })
      ] }),
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: retrying ? "Retrying\u2026" : "Fetching your Claude Code sessions\u2026" })
    ] });
  }
  if (loadErrorType) {
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", padding: 1, children: [
      /* @__PURE__ */ jsx(Text, { bold: true, color: "error", children: "Error loading Claude Code sessions" }),
      renderErrorSpecificGuidance(loadErrorType),
      /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "Press ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: "Ctrl+R" }),
        " to retry \xB7 Press",
        " ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: escKey }),
        " to cancel"
      ] })
    ] });
  }
  if (sessions.length === 0) {
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", padding: 1, children: [
      /* @__PURE__ */ jsxs(Text, { bold: true, children: [
        "No Claude Code sessions found",
        currentRepo && /* @__PURE__ */ jsxs(Text, { children: [
          " for ",
          currentRepo
        ] })
      ] }),
      /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "Press ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: escKey }),
        " to cancel"
      ] }) })
    ] });
  }
  const sessionMetadata = sessions.map((session_0) => ({
    ...session_0,
    timeString: formatRelativeTime(new Date(session_0.updated_at))
  }));
  const maxTimeStringLength = Math.max(UPDATED_STRING.length, ...sessionMetadata.map((meta) => meta.timeString.length));
  const options = sessionMetadata.map(({
    timeString,
    title,
    id
  }) => {
    const paddedTime = timeString.padEnd(maxTimeStringLength, " ");
    return {
      label: `${paddedTime}  ${title}`,
      value: id
    };
  });
  const layoutOverhead = 7;
  const maxVisibleOptions = Math.max(1, isEmbedded ? Math.min(sessions.length, 5, rows - 6 - layoutOverhead) : Math.min(sessions.length, rows - 1 - layoutOverhead));
  const maxHeight = maxVisibleOptions + layoutOverhead;
  const showScrollPosition = sessions.length > maxVisibleOptions;
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", padding: 1, height: maxHeight, children: [
    /* @__PURE__ */ jsxs(Text, { bold: true, children: [
      "Select a session to resume",
      showScrollPosition && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        " ",
        "(",
        focusedIndex,
        " of ",
        sessions.length,
        ")"
      ] }),
      currentRepo && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        " (",
        currentRepo,
        ")"
      ] }),
      ":"
    ] }),
    /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, flexGrow: 1, children: [
      /* @__PURE__ */ jsx(Box, { marginLeft: 2, children: /* @__PURE__ */ jsxs(Text, { bold: true, children: [
        UPDATED_STRING.padEnd(maxTimeStringLength, " "),
        SPACE_BETWEEN_TABLE_COLUMNS,
        "Session Title"
      ] }) }),
      /* @__PURE__ */ jsx(Select, { visibleOptionCount: maxVisibleOptions, options, onChange: (value) => {
        const session_1 = sessions.find((s) => s.id === value);
        if (session_1) {
          onSelect(session_1);
        }
      }, onFocus: (value_0) => {
        const index = options.findIndex((o) => o.value === value_0);
        if (index >= 0) {
          setFocusedIndex(index + 1);
        }
      } })
    ] }),
    /* @__PURE__ */ jsx(Box, { flexDirection: "row", children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsxs(Byline, { children: [
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "\u2191/\u2193", action: "select" }),
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Enter", action: "confirm" }),
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "cancel" })
    ] }) }) })
  ] });
}
function determineErrorType(errorMessage) {
  const message = errorMessage.toLowerCase();
  if (message.includes("fetch") || message.includes("network") || message.includes("timeout")) {
    return "network";
  }
  if (message.includes("auth") || message.includes("token") || message.includes("permission") || message.includes("oauth") || message.includes("not authenticated") || message.includes("/login") || message.includes("console account") || message.includes("403")) {
    return "auth";
  }
  if (message.includes("api") || message.includes("rate limit") || message.includes("500") || message.includes("529")) {
    return "api";
  }
  return "other";
}
function renderErrorSpecificGuidance(errorType) {
  switch (errorType) {
    case "network":
      return /* @__PURE__ */ jsx(Box, { marginY: 1, flexDirection: "column", children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Check your internet connection" }) });
    case "auth":
      return /* @__PURE__ */ jsxs(Box, { marginY: 1, flexDirection: "column", children: [
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Teleport requires a Claude account" }),
        /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          "Run ",
          /* @__PURE__ */ jsx(Text, { bold: true, children: "/login" }),
          ' and select "Claude account with subscription"'
        ] })
      ] });
    case "api":
      return /* @__PURE__ */ jsx(Box, { marginY: 1, flexDirection: "column", children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Sorry, Claude encountered an error" }) });
    case "other":
      return /* @__PURE__ */ jsx(Box, { marginY: 1, flexDirection: "row", children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Sorry, Claude Code encountered an error" }) });
  }
}
export {
  ResumeTask
};
