import { EXIT_PLAN_MODE_V2_TOOL_NAME } from "../../tools/ExitPlanModeTool/constants.js";
import { logForDebugging } from "../debug.js";
import { sleep } from "../sleep.js";
import { isTransientNetworkError } from "../teleport/api.js";
import {
  pollRemoteSessionEvents
} from "../teleport.js";
const POLL_INTERVAL_MS = 3e3;
const MAX_CONSECUTIVE_FAILURES = 5;
class UltraplanPollError extends Error {
  constructor(message, reason, rejectCount, options) {
    super(message, options);
    this.reason = reason;
    this.rejectCount = rejectCount;
    this.name = "UltraplanPollError";
  }
  reason;
  rejectCount;
}
const ULTRAPLAN_TELEPORT_SENTINEL = "__ULTRAPLAN_TELEPORT_LOCAL__";
class ExitPlanModeScanner {
  exitPlanCalls = [];
  results = /* @__PURE__ */ new Map();
  rejectedIds = /* @__PURE__ */ new Set();
  terminated = null;
  rescanAfterRejection = false;
  everSeenPending = false;
  get rejectCount() {
    return this.rejectedIds.size;
  }
  /**
   * True when an ExitPlanMode tool_use exists with no tool_result yet —
   * the remote is showing the approval dialog in the browser.
   */
  get hasPendingPlan() {
    const id = this.exitPlanCalls.findLast((c) => !this.rejectedIds.has(c));
    return id !== void 0 && !this.results.has(id);
  }
  ingest(newEvents) {
    for (const m of newEvents) {
      if (m.type === "assistant") {
        for (const block of m.message.content) {
          if (block.type !== "tool_use") continue;
          const tu = block;
          if (tu.name === EXIT_PLAN_MODE_V2_TOOL_NAME) {
            this.exitPlanCalls.push(tu.id);
          }
        }
      } else if (m.type === "user") {
        const content = m.message.content;
        if (!Array.isArray(content)) continue;
        for (const block of content) {
          if (block.type === "tool_result") {
            this.results.set(block.tool_use_id, block);
          }
        }
      } else if (m.type === "result" && m.subtype !== "success") {
        this.terminated = { subtype: m.subtype };
      }
    }
    const shouldScan = newEvents.length > 0 || this.rescanAfterRejection;
    this.rescanAfterRejection = false;
    let found = null;
    if (shouldScan) {
      for (let i = this.exitPlanCalls.length - 1; i >= 0; i--) {
        const id = this.exitPlanCalls[i];
        if (this.rejectedIds.has(id)) continue;
        const tr = this.results.get(id);
        if (!tr) {
          found = { kind: "pending" };
        } else if (tr.is_error === true) {
          const teleportPlan = extractTeleportPlan(tr.content);
          found = teleportPlan !== null ? { kind: "teleport", plan: teleportPlan } : { kind: "rejected", id };
        } else {
          found = { kind: "approved", plan: extractApprovedPlan(tr.content) };
        }
        break;
      }
      if (found?.kind === "approved" || found?.kind === "teleport") return found;
    }
    if (found?.kind === "rejected") {
      this.rejectedIds.add(found.id);
      this.rescanAfterRejection = true;
    }
    if (this.terminated) {
      return { kind: "terminated", subtype: this.terminated.subtype };
    }
    if (found?.kind === "rejected") {
      return found;
    }
    if (found?.kind === "pending") {
      this.everSeenPending = true;
      return found;
    }
    return { kind: "unchanged" };
  }
}
async function pollForApprovedExitPlanMode(sessionId, timeoutMs, onPhaseChange, shouldStop) {
  const deadline = Date.now() + timeoutMs;
  const scanner = new ExitPlanModeScanner();
  let cursor = null;
  let failures = 0;
  let lastPhase = "running";
  while (Date.now() < deadline) {
    if (shouldStop?.()) {
      throw new UltraplanPollError(
        "poll stopped by caller",
        "stopped",
        scanner.rejectCount
      );
    }
    let newEvents;
    let sessionStatus;
    try {
      const resp = await pollRemoteSessionEvents(sessionId, cursor);
      newEvents = resp.newEvents;
      cursor = resp.lastEventId;
      sessionStatus = resp.sessionStatus;
      failures = 0;
    } catch (e) {
      const transient = isTransientNetworkError(e);
      if (!transient || ++failures >= MAX_CONSECUTIVE_FAILURES) {
        throw new UltraplanPollError(
          e instanceof Error ? e.message : String(e),
          "network_or_unknown",
          scanner.rejectCount,
          { cause: e }
        );
      }
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    let result;
    try {
      result = scanner.ingest(newEvents);
    } catch (e) {
      throw new UltraplanPollError(
        e instanceof Error ? e.message : String(e),
        "extract_marker_missing",
        scanner.rejectCount
      );
    }
    if (result.kind === "approved") {
      return {
        plan: result.plan,
        rejectCount: scanner.rejectCount,
        executionTarget: "remote"
      };
    }
    if (result.kind === "teleport") {
      return {
        plan: result.plan,
        rejectCount: scanner.rejectCount,
        executionTarget: "local"
      };
    }
    if (result.kind === "terminated") {
      throw new UltraplanPollError(
        `remote session ended (${result.subtype}) before plan approval`,
        "terminated",
        scanner.rejectCount
      );
    }
    const quietIdle = (sessionStatus === "idle" || sessionStatus === "requires_action") && newEvents.length === 0;
    const phase = scanner.hasPendingPlan ? "plan_ready" : quietIdle ? "needs_input" : "running";
    if (phase !== lastPhase) {
      logForDebugging(`[ultraplan] phase ${lastPhase} \u2192 ${phase}`);
      lastPhase = phase;
      onPhaseChange?.(phase);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new UltraplanPollError(
    scanner.everSeenPending ? `no approval after ${timeoutMs / 1e3}s` : `ExitPlanMode never reached after ${timeoutMs / 1e3}s (the remote container failed to start, or session ID mismatch?)`,
    scanner.everSeenPending ? "timeout_pending" : "timeout_no_plan",
    scanner.rejectCount
  );
}
function contentToText(content) {
  return typeof content === "string" ? content : Array.isArray(content) ? content.map((b) => "text" in b ? b.text : "").join("") : "";
}
function extractTeleportPlan(content) {
  const text = contentToText(content);
  const marker = `${ULTRAPLAN_TELEPORT_SENTINEL}
`;
  const idx = text.indexOf(marker);
  if (idx === -1) return null;
  return text.slice(idx + marker.length).trimEnd();
}
function extractApprovedPlan(content) {
  const text = contentToText(content);
  const markers = [
    "## Approved Plan (edited by user):\n",
    "## Approved Plan:\n"
  ];
  for (const marker of markers) {
    const idx = text.indexOf(marker);
    if (idx !== -1) {
      return text.slice(idx + marker.length).trimEnd();
    }
  }
  throw new Error(
    `ExitPlanMode approved but tool_result has no "## Approved Plan:" marker \u2014 remote may have hit the empty-plan or isAgent branch. Content preview: ${text.slice(0, 200)}`
  );
}
export {
  ExitPlanModeScanner,
  ULTRAPLAN_TELEPORT_SENTINEL,
  UltraplanPollError,
  pollForApprovedExitPlanMode
};
