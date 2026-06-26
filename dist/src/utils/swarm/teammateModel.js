import { CLAUDE_OPUS_4_6_CONFIG } from "../model/configs.js";
import { getAPIProvider } from "../model/providers.js";
function getHardcodedTeammateModelFallback() {
  return CLAUDE_OPUS_4_6_CONFIG[getAPIProvider()];
}
export {
  getHardcodedTeammateModelFallback
};
