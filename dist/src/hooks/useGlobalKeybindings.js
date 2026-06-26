import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
const feature = (_name) => false;
import { useCallback } from "react";
import instances from "../ink/instances.js";
import { useKeybinding } from "../keybindings/useKeybinding.js";
import "../services/analytics/growthbook.js";
import { logEvent } from "../services/analytics/index.js";
import { useAppState, useSetAppState } from "../state/AppState.js";
import { count } from "../utils/array.js";
import "../utils/terminalPanel.js";
function GlobalKeybindingHandlers({
  screen,
  setScreen,
  showAllInTranscript,
  setShowAllInTranscript,
  messageCount,
  onEnterTranscript,
  onExitTranscript,
  virtualScrollActive,
  searchBarOpen = false
}) {
  const expandedView = useAppState((s) => s.expandedView);
  const setAppState = useSetAppState();
  const handleToggleTodos = useCallback(() => {
    logEvent("tengu_toggle_todos", {
      is_expanded: expandedView === "tasks"
    });
    setAppState((prev) => {
      const {
        getAllInProcessTeammateTasks
      } = (
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require2("../tasks/InProcessTeammateTask/InProcessTeammateTask.js")
      );
      const hasTeammates = count(getAllInProcessTeammateTasks(prev.tasks), (t) => t.status === "running") > 0;
      if (hasTeammates) {
        switch (prev.expandedView) {
          case "none":
            return {
              ...prev,
              expandedView: "tasks"
            };
          case "tasks":
            return {
              ...prev,
              expandedView: "teammates"
            };
          case "teammates":
            return {
              ...prev,
              expandedView: "none"
            };
        }
      }
      return {
        ...prev,
        expandedView: prev.expandedView === "tasks" ? "none" : "tasks"
      };
    });
  }, [expandedView, setAppState]);
  const isBriefOnly = false ? (
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useAppState((s_0) => s_0.isBriefOnly)
  ) : false;
  const handleToggleTranscript = useCallback(() => {
    if (false) {
      const {
        isBriefEnabled
      } = require2("../tools/BriefTool/BriefTool.js");
      if (!isBriefEnabled() && isBriefOnly && screen !== "transcript") {
        setAppState((prev_0) => {
          if (!prev_0.isBriefOnly) return prev_0;
          return {
            ...prev_0,
            isBriefOnly: false
          };
        });
        return;
      }
    }
    const isEnteringTranscript = screen !== "transcript";
    logEvent("tengu_toggle_transcript", {
      is_entering: isEnteringTranscript,
      show_all: showAllInTranscript,
      message_count: messageCount
    });
    setScreen((s_1) => s_1 === "transcript" ? "prompt" : "transcript");
    setShowAllInTranscript(false);
    if (isEnteringTranscript && onEnterTranscript) {
      onEnterTranscript();
    }
    if (!isEnteringTranscript && onExitTranscript) {
      onExitTranscript();
    }
  }, [screen, setScreen, isBriefOnly, showAllInTranscript, setShowAllInTranscript, messageCount, setAppState, onEnterTranscript, onExitTranscript]);
  const handleToggleShowAll = useCallback(() => {
    logEvent("tengu_transcript_toggle_show_all", {
      is_expanding: !showAllInTranscript,
      message_count: messageCount
    });
    setShowAllInTranscript((prev_1) => !prev_1);
  }, [showAllInTranscript, setShowAllInTranscript, messageCount]);
  const handleExitTranscript = useCallback(() => {
    logEvent("tengu_transcript_exit", {
      show_all: showAllInTranscript,
      message_count: messageCount
    });
    setScreen("prompt");
    setShowAllInTranscript(false);
    if (onExitTranscript) {
      onExitTranscript();
    }
  }, [setScreen, showAllInTranscript, setShowAllInTranscript, messageCount, onExitTranscript]);
  const handleToggleBrief = useCallback(() => {
    if (false) {
      const {
        isBriefEnabled: isBriefEnabled_0
      } = require2("../tools/BriefTool/BriefTool.js");
      if (!isBriefEnabled_0() && !isBriefOnly) return;
      const next = !isBriefOnly;
      logEvent("tengu_brief_mode_toggled", {
        enabled: next,
        gated: false,
        source: "keybinding"
      });
      setAppState((prev_2) => {
        if (prev_2.isBriefOnly === next) return prev_2;
        return {
          ...prev_2,
          isBriefOnly: next
        };
      });
    }
  }, [isBriefOnly, setAppState]);
  useKeybinding("app:toggleTodos", handleToggleTodos, {
    context: "Global"
  });
  useKeybinding("app:toggleTranscript", handleToggleTranscript, {
    context: "Global"
  });
  if (false) {
    useKeybinding("app:toggleBrief", handleToggleBrief, {
      context: "Global"
    });
  }
  useKeybinding("app:toggleTeammatePreview", () => {
    setAppState((prev_3) => ({
      ...prev_3,
      showTeammateMessagePreview: !prev_3.showTeammateMessagePreview
    }));
  }, {
    context: "Global"
  });
  const handleToggleTerminal = useCallback(() => {
    if (false) {
      if (!getFeatureValue_CACHED_MAY_BE_STALE("tengu_terminal_panel", false)) {
        return;
      }
      getTerminalPanel().toggle();
    }
  }, []);
  useKeybinding("app:toggleTerminal", handleToggleTerminal, {
    context: "Global"
  });
  const handleRedraw = useCallback(() => {
    instances.get(process.stdout)?.forceRedraw();
  }, []);
  useKeybinding("app:redraw", handleRedraw, {
    context: "Global"
  });
  const isInTranscript = screen === "transcript";
  useKeybinding("transcript:toggleShowAll", handleToggleShowAll, {
    context: "Transcript",
    isActive: isInTranscript && !virtualScrollActive
  });
  useKeybinding("transcript:exit", handleExitTranscript, {
    context: "Transcript",
    // Bar-open is a mode (owns keystrokes). Navigating (highlights
    // visible, n/N active, bar closed) is NOT — Esc exits transcript
    // directly, same as less q. useSearchInput doesn't stopPropagation,
    // so without this gate its onCancel AND this handler would both
    // fire on one Esc (child registers first, fires first, bubbles).
    isActive: isInTranscript && !searchBarOpen
  });
  return null;
}
export {
  GlobalKeybindingHandlers
};
