import { useEffect } from "react";
import { useAppState, useSetAppState } from "../state/AppState.js";
import { exitTeammateView } from "../state/teammateViewHelpers.js";
import { isInProcessTeammateTask } from "../tasks/InProcessTeammateTask/types.js";
function useTeammateViewAutoExit() {
  const setAppState = useSetAppState();
  const viewingAgentTaskId = useAppState((s) => s.viewingAgentTaskId);
  const task = useAppState(
    (s) => s.viewingAgentTaskId ? s.tasks[s.viewingAgentTaskId] : void 0
  );
  const viewedTask = task && isInProcessTeammateTask(task) ? task : void 0;
  const viewedStatus = viewedTask?.status;
  const viewedError = viewedTask?.error;
  const taskExists = task !== void 0;
  useEffect(() => {
    if (!viewingAgentTaskId) {
      return;
    }
    if (!taskExists) {
      exitTeammateView(setAppState);
      return;
    }
    if (!viewedTask) return;
    if (viewedStatus === "killed" || viewedStatus === "failed" || viewedError || viewedStatus !== "running" && viewedStatus !== "completed" && viewedStatus !== "pending") {
      exitTeammateView(setAppState);
      return;
    }
  }, [
    viewingAgentTaskId,
    taskExists,
    viewedTask,
    viewedStatus,
    viewedError,
    setAppState
  ]);
}
export {
  useTeammateViewAutoExit
};
