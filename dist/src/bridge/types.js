const DEFAULT_SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1e3;
const BRIDGE_LOGIN_INSTRUCTION = "Remote Control is only available with claude.ai subscriptions. Please use `/login` to sign in with your claude.ai account.";
const BRIDGE_LOGIN_ERROR = "Error: You must be logged in to use Remote Control.\n\n" + BRIDGE_LOGIN_INSTRUCTION;
const REMOTE_CONTROL_DISCONNECTED_MSG = "Remote Control disconnected.";
export {
  BRIDGE_LOGIN_ERROR,
  BRIDGE_LOGIN_INSTRUCTION,
  DEFAULT_SESSION_TIMEOUT_MS,
  REMOTE_CONTROL_DISCONNECTED_MSG
};
