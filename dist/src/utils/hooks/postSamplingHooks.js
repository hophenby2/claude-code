import { toError } from "../errors.js";
import { logError } from "../log.js";
const postSamplingHooks = [];
function registerPostSamplingHook(hook) {
  postSamplingHooks.push(hook);
}
function clearPostSamplingHooks() {
  postSamplingHooks.length = 0;
}
async function executePostSamplingHooks(messages, systemPrompt, userContext, systemContext, toolUseContext, querySource) {
  const context = {
    messages,
    systemPrompt,
    userContext,
    systemContext,
    toolUseContext,
    querySource
  };
  for (const hook of postSamplingHooks) {
    try {
      await hook(context);
    } catch (error) {
      logError(toError(error));
    }
  }
}
export {
  clearPostSamplingHooks,
  executePostSamplingHooks,
  registerPostSamplingHook
};
