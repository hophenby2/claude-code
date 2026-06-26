import { updateAgentSummary } from "../../tasks/LocalAgentTask/LocalAgentTask.js";
import { filterIncompleteToolCalls } from "../../tools/AgentTool/runAgent.js";
import { logForDebugging } from "../../utils/debug.js";
import {
  runForkedAgent
} from "../../utils/forkedAgent.js";
import { logError } from "../../utils/log.js";
import { createUserMessage } from "../../utils/messages.js";
import { getAgentTranscript } from "../../utils/sessionStorage.js";
const SUMMARY_INTERVAL_MS = 3e4;
function buildSummaryPrompt(previousSummary) {
  const prevLine = previousSummary ? `
Previous: "${previousSummary}" \u2014 say something NEW.
` : "";
  return `Describe your most recent action in 3-5 words using present tense (-ing). Name the file or function, not the branch. Do not use tools.
${prevLine}
Good: "Reading runAgent.ts"
Good: "Fixing null check in validate.ts"
Good: "Running auth module tests"
Good: "Adding retry logic to fetchUser"

Bad (past tense): "Analyzed the branch diff"
Bad (too vague): "Investigating the issue"
Bad (too long): "Reviewing full branch diff and AgentTool.tsx integration"
Bad (branch name): "Analyzed adam/background-summary branch diff"`;
}
function startAgentSummarization(taskId, agentId, cacheSafeParams, setAppState) {
  const { forkContextMessages: _drop, ...baseParams } = cacheSafeParams;
  let summaryAbortController = null;
  let timeoutId = null;
  let stopped = false;
  let previousSummary = null;
  async function runSummary() {
    if (stopped) return;
    logForDebugging(`[AgentSummary] Timer fired for agent ${agentId}`);
    try {
      const transcript = await getAgentTranscript(agentId);
      if (!transcript || transcript.messages.length < 3) {
        logForDebugging(
          `[AgentSummary] Skipping summary for ${taskId}: not enough messages (${transcript?.messages.length ?? 0})`
        );
        return;
      }
      const cleanMessages = filterIncompleteToolCalls(transcript.messages);
      const forkParams = {
        ...baseParams,
        forkContextMessages: cleanMessages
      };
      logForDebugging(
        `[AgentSummary] Forking for summary, ${cleanMessages.length} messages in context`
      );
      summaryAbortController = new AbortController();
      const canUseTool = async () => ({
        behavior: "deny",
        message: "No tools needed for summary",
        decisionReason: { type: "other", reason: "summary only" }
      });
      const result = await runForkedAgent({
        promptMessages: [
          createUserMessage({ content: buildSummaryPrompt(previousSummary) })
        ],
        cacheSafeParams: forkParams,
        canUseTool,
        querySource: "agent_summary",
        forkLabel: "agent_summary",
        overrides: { abortController: summaryAbortController },
        skipTranscript: true
      });
      if (stopped) return;
      for (const msg of result.messages) {
        if (msg.type !== "assistant") continue;
        if (msg.isApiErrorMessage) {
          logForDebugging(
            `[AgentSummary] Skipping API error message for ${taskId}`
          );
          continue;
        }
        const textBlock = msg.message.content.find((b) => b.type === "text");
        if (textBlock?.type === "text" && textBlock.text.trim()) {
          const summaryText = textBlock.text.trim();
          logForDebugging(
            `[AgentSummary] Summary result for ${taskId}: ${summaryText}`
          );
          previousSummary = summaryText;
          updateAgentSummary(taskId, summaryText, setAppState);
          break;
        }
      }
    } catch (e) {
      if (!stopped && e instanceof Error) {
        logError(e);
      }
    } finally {
      summaryAbortController = null;
      if (!stopped) {
        scheduleNext();
      }
    }
  }
  function scheduleNext() {
    if (stopped) return;
    timeoutId = setTimeout(runSummary, SUMMARY_INTERVAL_MS);
  }
  function stop() {
    logForDebugging(`[AgentSummary] Stopping summarization for ${taskId}`);
    stopped = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (summaryAbortController) {
      summaryAbortController.abort();
      summaryAbortController = null;
    }
  }
  scheduleNext();
  return { stop };
}
export {
  startAgentSummarization
};
