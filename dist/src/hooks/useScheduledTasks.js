import { useEffect, useRef } from "react";
import { useAppStateStore, useSetAppState } from "../state/AppState.js";
import { isTerminalTaskStatus } from "../Task.js";
import {
  findTeammateTaskByAgentId,
  injectUserMessageToTeammate
} from "../tasks/InProcessTeammateTask/InProcessTeammateTask.js";
import { isKairosCronEnabled } from "../tools/ScheduleCronTool/prompt.js";
import { getCronJitterConfig } from "../utils/cronJitterConfig.js";
import { createCronScheduler } from "../utils/cronScheduler.js";
import { removeCronTasks } from "../utils/cronTasks.js";
import { logForDebugging } from "../utils/debug.js";
import { enqueuePendingNotification } from "../utils/messageQueueManager.js";
import { createScheduledTaskFireMessage } from "../utils/messages.js";
import { WORKLOAD_CRON } from "../utils/workloadContext.js";
function useScheduledTasks({
  isLoading,
  assistantMode = false,
  setMessages
}) {
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;
  const store = useAppStateStore();
  const setAppState = useSetAppState();
  useEffect(() => {
    if (!isKairosCronEnabled()) return;
    const enqueueForLead = (prompt) => enqueuePendingNotification({
      value: prompt,
      mode: "prompt",
      priority: "later",
      isMeta: true,
      // Threaded through to cc_workload= in the billing-header
      // attribution block so the API can serve cron-initiated requests
      // at lower QoS when capacity is tight. No human is actively
      // waiting on this response.
      workload: WORKLOAD_CRON
    });
    const scheduler = createCronScheduler({
      // Missed-task surfacing (onFire fallback). Teammate crons are always
      // session-only (durable:false) so they never appear in the missed list,
      // which is populated from disk at scheduler startup — this path only
      // handles team-lead durable crons.
      onFire: enqueueForLead,
      // Normal fires receive the full CronTask so we can route by agentId.
      onFireTask: (task) => {
        if (task.agentId) {
          const teammate = findTeammateTaskByAgentId(
            task.agentId,
            store.getState().tasks
          );
          if (teammate && !isTerminalTaskStatus(teammate.status)) {
            injectUserMessageToTeammate(teammate.id, task.prompt, setAppState);
            return;
          }
          logForDebugging(
            `[ScheduledTasks] teammate ${task.agentId} gone, removing orphaned cron ${task.id}`
          );
          void removeCronTasks([task.id]);
          return;
        }
        const msg = createScheduledTaskFireMessage(
          `Running scheduled task (${formatCronFireTime(/* @__PURE__ */ new Date())})`
        );
        setMessages((prev) => [...prev, msg]);
        enqueueForLead(task.prompt);
      },
      isLoading: () => isLoadingRef.current,
      assistantMode,
      getJitterConfig: getCronJitterConfig,
      isKilled: () => !isKairosCronEnabled()
    });
    scheduler.start();
    return () => scheduler.stop();
  }, [assistantMode]);
}
function formatCronFireTime(d) {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).replace(/,? at |, /, " ").replace(/ ([AP]M)/, (_, ampm) => ampm.toLowerCase());
}
export {
  useScheduledTasks
};
