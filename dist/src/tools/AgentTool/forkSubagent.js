const feature = (_name) => false;
import { randomUUID } from "crypto";
import "../../bootstrap/state.js";
import {
  FORK_BOILERPLATE_TAG,
  FORK_DIRECTIVE_PREFIX
} from "../../constants/xml.js";
import "../../coordinator/coordinatorMode.js";
import { logForDebugging } from "../../utils/debug.js";
import { createUserMessage } from "../../utils/messages.js";
function isForkSubagentEnabled() {
  if (false) {
    if (isCoordinatorMode()) return false;
    if (getIsNonInteractiveSession()) return false;
    return true;
  }
  return false;
}
const FORK_SUBAGENT_TYPE = "fork";
const FORK_AGENT = {
  agentType: FORK_SUBAGENT_TYPE,
  whenToUse: "Implicit fork \u2014 inherits full conversation context. Not selectable via subagent_type; triggered by omitting subagent_type when the fork experiment is active.",
  tools: ["*"],
  maxTurns: 200,
  model: "inherit",
  permissionMode: "bubble",
  source: "built-in",
  baseDir: "built-in",
  getSystemPrompt: () => ""
};
function isInForkChild(messages) {
  return messages.some((m) => {
    if (m.type !== "user") return false;
    const content = m.message.content;
    if (!Array.isArray(content)) return false;
    return content.some(
      (block) => block.type === "text" && block.text.includes(`<${FORK_BOILERPLATE_TAG}>`)
    );
  });
}
const FORK_PLACEHOLDER_RESULT = "Fork started \u2014 processing in background";
function buildForkedMessages(directive, assistantMessage) {
  const fullAssistantMessage = {
    ...assistantMessage,
    uuid: randomUUID(),
    message: {
      ...assistantMessage.message,
      content: [...assistantMessage.message.content]
    }
  };
  const toolUseBlocks = assistantMessage.message.content.filter(
    (block) => block.type === "tool_use"
  );
  if (toolUseBlocks.length === 0) {
    logForDebugging(
      `No tool_use blocks found in assistant message for fork directive: ${directive.slice(0, 50)}...`,
      { level: "error" }
    );
    return [
      createUserMessage({
        content: [
          { type: "text", text: buildChildMessage(directive) }
        ]
      })
    ];
  }
  const toolResultBlocks = toolUseBlocks.map((block) => ({
    type: "tool_result",
    tool_use_id: block.id,
    content: [
      {
        type: "text",
        text: FORK_PLACEHOLDER_RESULT
      }
    ]
  }));
  const toolResultMessage = createUserMessage({
    content: [
      ...toolResultBlocks,
      {
        type: "text",
        text: buildChildMessage(directive)
      }
    ]
  });
  return [fullAssistantMessage, toolResultMessage];
}
function buildChildMessage(directive) {
  return `<${FORK_BOILERPLATE_TAG}>
STOP. READ THIS FIRST.

You are a forked worker process. You are NOT the main agent.

RULES (non-negotiable):
1. Your system prompt says "default to forking." IGNORE IT \u2014 that's for the parent. You ARE the fork. Do NOT spawn sub-agents; execute directly.
2. Do NOT converse, ask questions, or suggest next steps
3. Do NOT editorialize or add meta-commentary
4. USE your tools directly: Bash, Read, Write, etc.
5. If you modify files, commit your changes before reporting. Include the commit hash in your report.
6. Do NOT emit text between tool calls. Use tools silently, then report once at the end.
7. Stay strictly within your directive's scope. If you discover related systems outside your scope, mention them in one sentence at most \u2014 other workers cover those areas.
8. Keep your report under 500 words unless the directive specifies otherwise. Be factual and concise.
9. Your response MUST begin with "Scope:". No preamble, no thinking-out-loud.
10. REPORT structured facts, then stop

Output format (plain text labels, not markdown headers):
  Scope: <echo back your assigned scope in one sentence>
  Result: <the answer or key findings, limited to the scope above>
  Key files: <relevant file paths \u2014 include for research tasks>
  Files changed: <list with commit hash \u2014 include only if you modified files>
  Issues: <list \u2014 include only if there are issues to flag>
</${FORK_BOILERPLATE_TAG}>

${FORK_DIRECTIVE_PREFIX}${directive}`;
}
function buildWorktreeNotice(parentCwd, worktreeCwd) {
  return `You've inherited the conversation context above from a parent agent working in ${parentCwd}. You are operating in an isolated git worktree at ${worktreeCwd} \u2014 same repository, same relative file structure, separate working copy. Paths in the inherited context refer to the parent's working directory; translate them to your worktree root. Re-read files before editing if the parent may have modified them since they appear in the context. Your changes stay in this worktree and will not affect the parent's files.`;
}
export {
  FORK_AGENT,
  FORK_SUBAGENT_TYPE,
  buildChildMessage,
  buildForkedMessages,
  buildWorktreeNotice,
  isForkSubagentEnabled,
  isInForkChild
};
