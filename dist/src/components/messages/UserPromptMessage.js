import { jsx } from "react/jsx-runtime";
const feature = (_name) => false;
import { useContext, useMemo } from "react";
import "../../bootstrap/state.js";
import { Box } from "../../ink.js";
import "../../services/analytics/growthbook.js";
import "../../state/AppState.js";
import "../../utils/envUtils.js";
import { logError } from "../../utils/log.js";
import { countCharInString } from "../../utils/stringUtils.js";
import { MessageActionsSelectedContext } from "../messageActions.js";
import { HighlightedThinkingText } from "./HighlightedThinkingText.js";
const MAX_DISPLAY_CHARS = 1e4;
const TRUNCATE_HEAD_CHARS = 2500;
const TRUNCATE_TAIL_CHARS = 2500;
function UserPromptMessage({
  addMargin,
  param: {
    text
  },
  isTranscriptMode,
  timestamp
}) {
  const isBriefOnly = false ? (
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useAppState((s) => s.isBriefOnly)
  ) : false;
  const viewingAgentTaskId = false ? (
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useAppState((s_0) => s_0.viewingAgentTaskId)
  ) : null;
  const briefEnvEnabled = false ? (
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useMemo(() => isEnvTruthy(process.env.CLAUDE_CODE_BRIEF), [])
  ) : false;
  const useBriefLayout = false ? (getKairosActive() || getUserMsgOptIn() && (briefEnvEnabled || getFeatureValue_CACHED_MAY_BE_STALE("tengu_kairos_brief", false))) && isBriefOnly && !isTranscriptMode && !viewingAgentTaskId : false;
  const displayText = useMemo(() => {
    if (text.length <= MAX_DISPLAY_CHARS) return text;
    const head = text.slice(0, TRUNCATE_HEAD_CHARS);
    const tail = text.slice(-TRUNCATE_TAIL_CHARS);
    const hiddenLines = countCharInString(text, "\n", TRUNCATE_HEAD_CHARS) - countCharInString(tail, "\n");
    return `${head}
\u2026 +${hiddenLines} lines \u2026
${tail}`;
  }, [text]);
  const isSelected = useContext(MessageActionsSelectedContext);
  if (!text) {
    logError(new Error("No content found in user prompt message"));
    return null;
  }
  return /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginTop: addMargin ? 1 : 0, backgroundColor: isSelected ? "messageActionsBackground" : useBriefLayout ? void 0 : "userMessageBackground", paddingRight: useBriefLayout ? 0 : 1, children: /* @__PURE__ */ jsx(HighlightedThinkingText, { text: displayText, useBriefLayout, timestamp: useBriefLayout ? timestamp : void 0 }) });
}
export {
  UserPromptMessage
};
