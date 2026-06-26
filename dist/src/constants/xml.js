const COMMAND_NAME_TAG = "command-name";
const COMMAND_MESSAGE_TAG = "command-message";
const COMMAND_ARGS_TAG = "command-args";
const BASH_INPUT_TAG = "bash-input";
const BASH_STDOUT_TAG = "bash-stdout";
const BASH_STDERR_TAG = "bash-stderr";
const LOCAL_COMMAND_STDOUT_TAG = "local-command-stdout";
const LOCAL_COMMAND_STDERR_TAG = "local-command-stderr";
const LOCAL_COMMAND_CAVEAT_TAG = "local-command-caveat";
const TERMINAL_OUTPUT_TAGS = [
  BASH_INPUT_TAG,
  BASH_STDOUT_TAG,
  BASH_STDERR_TAG,
  LOCAL_COMMAND_STDOUT_TAG,
  LOCAL_COMMAND_STDERR_TAG,
  LOCAL_COMMAND_CAVEAT_TAG
];
const TICK_TAG = "tick";
const TASK_NOTIFICATION_TAG = "task-notification";
const TASK_ID_TAG = "task-id";
const TOOL_USE_ID_TAG = "tool-use-id";
const TASK_TYPE_TAG = "task-type";
const OUTPUT_FILE_TAG = "output-file";
const STATUS_TAG = "status";
const SUMMARY_TAG = "summary";
const REASON_TAG = "reason";
const WORKTREE_TAG = "worktree";
const WORKTREE_PATH_TAG = "worktreePath";
const WORKTREE_BRANCH_TAG = "worktreeBranch";
const ULTRAPLAN_TAG = "ultraplan";
const REMOTE_REVIEW_TAG = "remote-review";
const REMOTE_REVIEW_PROGRESS_TAG = "remote-review-progress";
const TEAMMATE_MESSAGE_TAG = "teammate-message";
const CHANNEL_MESSAGE_TAG = "channel-message";
const CHANNEL_TAG = "channel";
const CROSS_SESSION_MESSAGE_TAG = "cross-session-message";
const FORK_BOILERPLATE_TAG = "fork-boilerplate";
const FORK_DIRECTIVE_PREFIX = "Your directive: ";
const COMMON_HELP_ARGS = ["help", "-h", "--help"];
const COMMON_INFO_ARGS = [
  "list",
  "show",
  "display",
  "current",
  "view",
  "get",
  "check",
  "describe",
  "print",
  "version",
  "about",
  "status",
  "?"
];
export {
  BASH_INPUT_TAG,
  BASH_STDERR_TAG,
  BASH_STDOUT_TAG,
  CHANNEL_MESSAGE_TAG,
  CHANNEL_TAG,
  COMMAND_ARGS_TAG,
  COMMAND_MESSAGE_TAG,
  COMMAND_NAME_TAG,
  COMMON_HELP_ARGS,
  COMMON_INFO_ARGS,
  CROSS_SESSION_MESSAGE_TAG,
  FORK_BOILERPLATE_TAG,
  FORK_DIRECTIVE_PREFIX,
  LOCAL_COMMAND_CAVEAT_TAG,
  LOCAL_COMMAND_STDERR_TAG,
  LOCAL_COMMAND_STDOUT_TAG,
  OUTPUT_FILE_TAG,
  REASON_TAG,
  REMOTE_REVIEW_PROGRESS_TAG,
  REMOTE_REVIEW_TAG,
  STATUS_TAG,
  SUMMARY_TAG,
  TASK_ID_TAG,
  TASK_NOTIFICATION_TAG,
  TASK_TYPE_TAG,
  TEAMMATE_MESSAGE_TAG,
  TERMINAL_OUTPUT_TAGS,
  TICK_TAG,
  TOOL_USE_ID_TAG,
  ULTRAPLAN_TAG,
  WORKTREE_BRANCH_TAG,
  WORKTREE_PATH_TAG,
  WORKTREE_TAG
};
