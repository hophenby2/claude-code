const NULL_RENDERING_TYPES = [
  "hook_success",
  "hook_additional_context",
  "hook_cancelled",
  "command_permissions",
  "agent_mention",
  "budget_usd",
  "critical_system_reminder",
  "edited_image_file",
  "edited_text_file",
  "opened_file_in_ide",
  "output_style",
  "plan_mode",
  "plan_mode_exit",
  "plan_mode_reentry",
  "structured_output",
  "team_context",
  "todo_reminder",
  "context_efficiency",
  "deferred_tools_delta",
  "mcp_instructions_delta",
  "companion_intro",
  "token_usage",
  "ultrathink_effort",
  "max_turns_reached",
  "task_reminder",
  "auto_mode",
  "auto_mode_exit",
  "output_token_usage",
  "pen_mode_enter",
  "pen_mode_exit",
  "verify_plan_reminder",
  "current_session_memory",
  "compaction_reminder",
  "date_change"
];
const NULL_RENDERING_ATTACHMENT_TYPES = new Set(NULL_RENDERING_TYPES);
function isNullRenderingAttachment(msg) {
  return msg.type === "attachment" && NULL_RENDERING_ATTACHMENT_TYPES.has(msg.attachment.type);
}
export {
  isNullRenderingAttachment
};
