import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
import "fs";
import { REMOTE_CONTROL_DISCONNECTED_MSG } from "../bridge/types.js";
import { DIAMOND_OPEN } from "../constants/figures.js";
import { getRemoteSessionUrl } from "../constants/product.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../services/analytics/growthbook.js";
import { logEvent } from "../services/analytics/index.js";
import { checkRemoteAgentEligibility, formatPreconditionError, RemoteAgentTask, registerRemoteAgentTask } from "../tasks/RemoteAgentTask/RemoteAgentTask.js";
import { logForDebugging } from "../utils/debug.js";
import { errorMessage } from "../utils/errors.js";
import { logError } from "../utils/log.js";
import { enqueuePendingNotification } from "../utils/messageQueueManager.js";
import { ALL_MODEL_CONFIGS } from "../utils/model/configs.js";
import { updateTaskState } from "../utils/task/framework.js";
import { archiveRemoteSession, teleportToRemote } from "../utils/teleport.js";
import { pollForApprovedExitPlanMode, UltraplanPollError } from "../utils/ultraplan/ccrSession.js";
const ULTRAPLAN_TIMEOUT_MS = 30 * 60 * 1e3;
const CCR_TERMS_URL = "https://code.claude.com/docs/en/claude-code-on-the-web";
function getUltraplanModel() {
  return getFeatureValue_CACHED_MAY_BE_STALE("tengu_ultraplan_model", ALL_MODEL_CONFIGS.opus46.firstParty);
}
const _rawPrompt = require2("../utils/ultraplan/prompt.txt");
const DEFAULT_INSTRUCTIONS = (typeof _rawPrompt === "string" ? _rawPrompt : _rawPrompt.default).trimEnd();
const ULTRAPLAN_INSTRUCTIONS = false ? readFileSync(process.env.ULTRAPLAN_PROMPT_FILE, "utf8").trimEnd() : DEFAULT_INSTRUCTIONS;
function buildUltraplanPrompt(blurb, seedPlan) {
  const parts = [];
  if (seedPlan) {
    parts.push("Here is a draft plan to refine:", "", seedPlan, "");
  }
  parts.push(ULTRAPLAN_INSTRUCTIONS);
  if (blurb) {
    parts.push("", blurb);
  }
  return parts.join("\n");
}
function startDetachedPoll(taskId, sessionId, url, getAppState, setAppState) {
  const started = Date.now();
  let failed = false;
  void (async () => {
    try {
      const {
        plan,
        rejectCount,
        executionTarget
      } = await pollForApprovedExitPlanMode(sessionId, ULTRAPLAN_TIMEOUT_MS, (phase) => {
        if (phase === "needs_input") logEvent("tengu_ultraplan_awaiting_input", {});
        updateTaskState(taskId, setAppState, (t) => {
          if (t.status !== "running") return t;
          const next = phase === "running" ? void 0 : phase;
          return t.ultraplanPhase === next ? t : {
            ...t,
            ultraplanPhase: next
          };
        });
      }, () => getAppState().tasks?.[taskId]?.status !== "running");
      logEvent("tengu_ultraplan_approved", {
        duration_ms: Date.now() - started,
        plan_length: plan.length,
        reject_count: rejectCount,
        execution_target: executionTarget
      });
      if (executionTarget === "remote") {
        const task = getAppState().tasks?.[taskId];
        if (task?.status !== "running") return;
        updateTaskState(taskId, setAppState, (t) => t.status !== "running" ? t : {
          ...t,
          status: "completed",
          endTime: Date.now()
        });
        setAppState((prev) => prev.ultraplanSessionUrl === url ? {
          ...prev,
          ultraplanSessionUrl: void 0
        } : prev);
        enqueuePendingNotification({
          value: [`Ultraplan approved \u2014 executing in Claude Code on the web. Follow along at: ${url}`, "", "Results will land as a pull request when the remote session finishes. There is nothing to do here."].join("\n"),
          mode: "task-notification"
        });
      } else {
        setAppState((prev) => {
          const task = prev.tasks?.[taskId];
          if (!task || task.status !== "running") return prev;
          return {
            ...prev,
            ultraplanPendingChoice: {
              plan,
              sessionId,
              taskId
            }
          };
        });
      }
    } catch (e) {
      const task = getAppState().tasks?.[taskId];
      if (task?.status !== "running") return;
      failed = true;
      logEvent("tengu_ultraplan_failed", {
        duration_ms: Date.now() - started,
        reason: e instanceof UltraplanPollError ? e.reason : "network_or_unknown",
        reject_count: e instanceof UltraplanPollError ? e.rejectCount : void 0
      });
      enqueuePendingNotification({
        value: `Ultraplan failed: ${errorMessage(e)}

Session: ${url}`,
        mode: "task-notification"
      });
      void archiveRemoteSession(sessionId).catch((e2) => logForDebugging(`ultraplan archive failed: ${String(e2)}`));
      setAppState((prev) => (
        // Compare against this poll's URL so a newer relaunched session's
        // URL isn't cleared by a stale poll erroring out.
        prev.ultraplanSessionUrl === url ? {
          ...prev,
          ultraplanSessionUrl: void 0
        } : prev
      ));
    } finally {
      if (failed) {
        updateTaskState(taskId, setAppState, (t) => t.status !== "running" ? t : {
          ...t,
          status: "failed",
          endTime: Date.now()
        });
      }
    }
  })();
}
function buildLaunchMessage(disconnectedBridge) {
  const prefix = disconnectedBridge ? `${REMOTE_CONTROL_DISCONNECTED_MSG} ` : "";
  return `${DIAMOND_OPEN} ultraplan
${prefix}Starting Claude Code on the web\u2026`;
}
function buildSessionReadyMessage(url) {
  return `${DIAMOND_OPEN} ultraplan \xB7 Monitor progress in Claude Code on the web ${url}
You can continue working \u2014 when the ${DIAMOND_OPEN} fills, press \u2193 to view results`;
}
function buildAlreadyActiveMessage(url) {
  return url ? `ultraplan: already polling. Open ${url} to check status, or wait for the plan to land here.` : "ultraplan: already launching. Please wait for the session to start.";
}
async function stopUltraplan(taskId, sessionId, setAppState) {
  await RemoteAgentTask.kill(taskId, setAppState);
  setAppState((prev) => prev.ultraplanSessionUrl || prev.ultraplanPendingChoice || prev.ultraplanLaunching ? {
    ...prev,
    ultraplanSessionUrl: void 0,
    ultraplanPendingChoice: void 0,
    ultraplanLaunching: void 0
  } : prev);
  const url = getRemoteSessionUrl(sessionId, process.env.SESSION_INGRESS_URL);
  enqueuePendingNotification({
    value: `Ultraplan stopped.

Session: ${url}`,
    mode: "task-notification"
  });
  enqueuePendingNotification({
    value: "The user stopped the ultraplan session above. Do not respond to the stop notification \u2014 wait for their next message.",
    mode: "task-notification",
    isMeta: true
  });
}
async function launchUltraplan(opts) {
  const {
    blurb,
    seedPlan,
    getAppState,
    setAppState,
    signal,
    disconnectedBridge,
    onSessionReady
  } = opts;
  const {
    ultraplanSessionUrl: active,
    ultraplanLaunching
  } = getAppState();
  if (active || ultraplanLaunching) {
    logEvent("tengu_ultraplan_create_failed", {
      reason: active ? "already_polling" : "already_launching"
    });
    return buildAlreadyActiveMessage(active);
  }
  if (!blurb && !seedPlan) {
    return [
      // Rendered via <Markdown>; raw <message> is tokenized as HTML
      // and dropped. Backslash-escape the brackets.
      'Usage: /ultraplan \\<prompt\\>, or include "ultraplan" anywhere',
      "in your prompt",
      "",
      "Advanced multi-agent plan mode with our most powerful model",
      "(Opus). Runs in Claude Code on the web. When the plan is ready,",
      "you can execute it in the web session or send it back here.",
      "Terminal stays free while the remote plans.",
      "Requires /login.",
      "",
      `Terms: ${CCR_TERMS_URL}`
    ].join("\n");
  }
  setAppState((prev) => prev.ultraplanLaunching ? prev : {
    ...prev,
    ultraplanLaunching: true
  });
  void launchDetached({
    blurb,
    seedPlan,
    getAppState,
    setAppState,
    signal,
    onSessionReady
  });
  return buildLaunchMessage(disconnectedBridge);
}
async function launchDetached(opts) {
  const {
    blurb,
    seedPlan,
    getAppState,
    setAppState,
    signal,
    onSessionReady
  } = opts;
  let sessionId;
  try {
    const model = getUltraplanModel();
    const eligibility = await checkRemoteAgentEligibility();
    if (!eligibility.eligible) {
      logEvent("tengu_ultraplan_create_failed", {
        reason: "precondition",
        precondition_errors: eligibility.errors.map((e) => e.type).join(",")
      });
      const reasons = eligibility.errors.map(formatPreconditionError).join("\n");
      enqueuePendingNotification({
        value: `ultraplan: cannot launch remote session \u2014
${reasons}`,
        mode: "task-notification"
      });
      return;
    }
    const prompt = buildUltraplanPrompt(blurb, seedPlan);
    let bundleFailMsg;
    const session = await teleportToRemote({
      initialMessage: prompt,
      description: blurb || "Refine local plan",
      model,
      permissionMode: "plan",
      ultraplan: true,
      signal,
      useDefaultEnvironment: true,
      onBundleFail: (msg) => {
        bundleFailMsg = msg;
      }
    });
    if (!session) {
      logEvent("tengu_ultraplan_create_failed", {
        reason: bundleFailMsg ? "bundle_fail" : "teleport_null"
      });
      enqueuePendingNotification({
        value: `ultraplan: session creation failed${bundleFailMsg ? ` \u2014 ${bundleFailMsg}` : ""}. See --debug for details.`,
        mode: "task-notification"
      });
      return;
    }
    sessionId = session.id;
    const url = getRemoteSessionUrl(session.id, process.env.SESSION_INGRESS_URL);
    setAppState((prev) => ({
      ...prev,
      ultraplanSessionUrl: url,
      ultraplanLaunching: void 0
    }));
    onSessionReady?.(buildSessionReadyMessage(url));
    logEvent("tengu_ultraplan_launched", {
      has_seed_plan: Boolean(seedPlan),
      model
    });
    const {
      taskId
    } = registerRemoteAgentTask({
      remoteTaskType: "ultraplan",
      session: {
        id: session.id,
        title: blurb || "Ultraplan"
      },
      command: blurb,
      context: {
        abortController: new AbortController(),
        getAppState,
        setAppState
      },
      isUltraplan: true
    });
    startDetachedPoll(taskId, session.id, url, getAppState, setAppState);
  } catch (e) {
    logError(e);
    logEvent("tengu_ultraplan_create_failed", {
      reason: "unexpected_error"
    });
    enqueuePendingNotification({
      value: `ultraplan: unexpected error \u2014 ${errorMessage(e)}`,
      mode: "task-notification"
    });
    if (sessionId) {
      void archiveRemoteSession(sessionId).catch((err) => logForDebugging("ultraplan: failed to archive orphaned session", err));
      setAppState((prev) => prev.ultraplanSessionUrl ? {
        ...prev,
        ultraplanSessionUrl: void 0
      } : prev);
    }
  } finally {
    setAppState((prev) => prev.ultraplanLaunching ? {
      ...prev,
      ultraplanLaunching: void 0
    } : prev);
  }
}
const call = async (onDone, context, args) => {
  const blurb = args.trim();
  if (!blurb) {
    const msg = await launchUltraplan({
      blurb,
      getAppState: context.getAppState,
      setAppState: context.setAppState,
      signal: context.abortController.signal
    });
    onDone(msg, {
      display: "system"
    });
    return null;
  }
  const {
    ultraplanSessionUrl: active,
    ultraplanLaunching
  } = context.getAppState();
  if (active || ultraplanLaunching) {
    logEvent("tengu_ultraplan_create_failed", {
      reason: active ? "already_polling" : "already_launching"
    });
    onDone(buildAlreadyActiveMessage(active), {
      display: "system"
    });
    return null;
  }
  context.setAppState((prev) => ({
    ...prev,
    ultraplanLaunchPending: {
      blurb
    }
  }));
  onDone(void 0, {
    display: "skip"
  });
  return null;
};
var ultraplan_default = {
  type: "local-jsx",
  name: "ultraplan",
  description: `~10\u201330 min \xB7 Claude Code on the web drafts an advanced plan you can edit and approve. See ${CCR_TERMS_URL}`,
  argumentHint: "<prompt>",
  isEnabled: () => false,
  load: () => Promise.resolve({
    call
  })
};
export {
  CCR_TERMS_URL,
  buildUltraplanPrompt,
  ultraplan_default as default,
  launchUltraplan,
  stopUltraplan
};
