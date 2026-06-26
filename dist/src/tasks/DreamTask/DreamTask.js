import { rollbackConsolidationLock } from "../../services/autoDream/consolidationLock.js";
import { createTaskStateBase, generateTaskId } from "../../Task.js";
import { registerTask, updateTaskState } from "../../utils/task/framework.js";
const MAX_TURNS = 30;
function isDreamTask(task) {
  return typeof task === "object" && task !== null && "type" in task && task.type === "dream";
}
function registerDreamTask(setAppState, opts) {
  const id = generateTaskId("dream");
  const task = {
    ...createTaskStateBase(id, "dream", "dreaming"),
    type: "dream",
    status: "running",
    phase: "starting",
    sessionsReviewing: opts.sessionsReviewing,
    filesTouched: [],
    turns: [],
    abortController: opts.abortController,
    priorMtime: opts.priorMtime
  };
  registerTask(task, setAppState);
  return id;
}
function addDreamTurn(taskId, turn, touchedPaths, setAppState) {
  updateTaskState(taskId, setAppState, (task) => {
    const seen = new Set(task.filesTouched);
    const newTouched = touchedPaths.filter((p) => !seen.has(p) && seen.add(p));
    if (turn.text === "" && turn.toolUseCount === 0 && newTouched.length === 0) {
      return task;
    }
    return {
      ...task,
      phase: newTouched.length > 0 ? "updating" : task.phase,
      filesTouched: newTouched.length > 0 ? [...task.filesTouched, ...newTouched] : task.filesTouched,
      turns: task.turns.slice(-(MAX_TURNS - 1)).concat(turn)
    };
  });
}
function completeDreamTask(taskId, setAppState) {
  updateTaskState(taskId, setAppState, (task) => ({
    ...task,
    status: "completed",
    endTime: Date.now(),
    notified: true,
    abortController: void 0
  }));
}
function failDreamTask(taskId, setAppState) {
  updateTaskState(taskId, setAppState, (task) => ({
    ...task,
    status: "failed",
    endTime: Date.now(),
    notified: true,
    abortController: void 0
  }));
}
const DreamTask = {
  name: "DreamTask",
  type: "dream",
  async kill(taskId, setAppState) {
    let priorMtime;
    updateTaskState(taskId, setAppState, (task) => {
      if (task.status !== "running") return task;
      task.abortController?.abort();
      priorMtime = task.priorMtime;
      return {
        ...task,
        status: "killed",
        endTime: Date.now(),
        notified: true,
        abortController: void 0
      };
    });
    if (priorMtime !== void 0) {
      await rollbackConsolidationLock(priorMtime);
    }
  }
};
export {
  DreamTask,
  addDreamTurn,
  completeDreamTask,
  failDreamTask,
  isDreamTask,
  registerDreamTask
};
