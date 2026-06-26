import { z } from "zod/v4";
import { buildTool } from "../../Tool.js";
import {
  executeTaskCreatedHooks,
  getTaskCreatedHookMessage
} from "../../utils/hooks.js";
import { lazySchema } from "../../utils/lazySchema.js";
import {
  createTask,
  deleteTask,
  getTaskListId,
  isTodoV2Enabled
} from "../../utils/tasks.js";
import { getAgentName, getTeamName } from "../../utils/teammate.js";
import { TASK_CREATE_TOOL_NAME } from "./constants.js";
import { DESCRIPTION, getPrompt } from "./prompt.js";
const inputSchema = lazySchema(
  () => z.strictObject({
    subject: z.string().describe("A brief title for the task"),
    description: z.string().describe("What needs to be done"),
    activeForm: z.string().optional().describe(
      'Present continuous form shown in spinner when in_progress (e.g., "Running tests")'
    ),
    metadata: z.record(z.string(), z.unknown()).optional().describe("Arbitrary metadata to attach to the task")
  })
);
const outputSchema = lazySchema(
  () => z.object({
    task: z.object({
      id: z.string(),
      subject: z.string()
    })
  })
);
const TaskCreateTool = buildTool({
  name: TASK_CREATE_TOOL_NAME,
  searchHint: "create a task in the task list",
  maxResultSizeChars: 1e5,
  async description() {
    return DESCRIPTION;
  },
  async prompt() {
    return getPrompt();
  },
  get inputSchema() {
    return inputSchema();
  },
  get outputSchema() {
    return outputSchema();
  },
  userFacingName() {
    return "TaskCreate";
  },
  shouldDefer: true,
  isEnabled() {
    return isTodoV2Enabled();
  },
  isConcurrencySafe() {
    return true;
  },
  toAutoClassifierInput(input) {
    return input.subject;
  },
  renderToolUseMessage() {
    return null;
  },
  async call({ subject, description, activeForm, metadata }, context) {
    const taskId = await createTask(getTaskListId(), {
      subject,
      description,
      activeForm,
      status: "pending",
      owner: void 0,
      blocks: [],
      blockedBy: [],
      metadata
    });
    const blockingErrors = [];
    const generator = executeTaskCreatedHooks(
      taskId,
      subject,
      description,
      getAgentName(),
      getTeamName(),
      void 0,
      context?.abortController?.signal,
      void 0,
      context
    );
    for await (const result of generator) {
      if (result.blockingError) {
        blockingErrors.push(getTaskCreatedHookMessage(result.blockingError));
      }
    }
    if (blockingErrors.length > 0) {
      await deleteTask(getTaskListId(), taskId);
      throw new Error(blockingErrors.join("\n"));
    }
    context.setAppState((prev) => {
      if (prev.expandedView === "tasks") return prev;
      return { ...prev, expandedView: "tasks" };
    });
    return {
      data: {
        task: {
          id: taskId,
          subject
        }
      }
    };
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const { task } = content;
    return {
      tool_use_id: toolUseID,
      type: "tool_result",
      content: `Task #${task.id} created successfully: ${task.subject}`
    };
  }
});
export {
  TaskCreateTool
};
