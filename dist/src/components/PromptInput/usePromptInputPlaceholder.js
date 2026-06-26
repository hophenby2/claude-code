const feature = (_name) => false;
import { useMemo } from "react";
import { useCommandQueue } from "../../hooks/useCommandQueue.js";
import { useAppState } from "../../state/AppState.js";
import { getGlobalConfig } from "../../utils/config.js";
import { getExampleCommandFromCache } from "../../utils/exampleCommands.js";
import { isQueuedCommandEditable } from "../../utils/messageQueueManager.js";
const proactiveModule = false ? null : null;
const NUM_TIMES_QUEUE_HINT_SHOWN = 3;
const MAX_TEAMMATE_NAME_LENGTH = 20;
function usePromptInputPlaceholder({
  input,
  submitCount,
  viewingAgentName
}) {
  const queuedCommands = useCommandQueue();
  const promptSuggestionEnabled = useAppState((s) => s.promptSuggestionEnabled);
  const placeholder = useMemo(() => {
    if (input !== "") {
      return;
    }
    if (viewingAgentName) {
      const displayName = viewingAgentName.length > MAX_TEAMMATE_NAME_LENGTH ? viewingAgentName.slice(0, MAX_TEAMMATE_NAME_LENGTH - 3) + "..." : viewingAgentName;
      return `Message @${displayName}\u2026`;
    }
    if (queuedCommands.some(isQueuedCommandEditable) && (getGlobalConfig().queuedCommandUpHintCount || 0) < NUM_TIMES_QUEUE_HINT_SHOWN) {
      return "Press up to edit queued messages";
    }
    if (submitCount < 1 && promptSuggestionEnabled && !proactiveModule?.isProactiveActive()) {
      return getExampleCommandFromCache();
    }
  }, [
    input,
    queuedCommands,
    submitCount,
    promptSuggestionEnabled,
    viewingAgentName
  ]);
  return placeholder;
}
export {
  usePromptInputPlaceholder
};
