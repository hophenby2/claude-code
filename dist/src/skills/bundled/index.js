const feature = (_name) => false;
import { shouldAutoEnableClaudeInChrome } from "../../utils/claudeInChrome/setup.js";
import { registerBatchSkill } from "./batch.js";
import { registerClaudeInChromeSkill } from "./claudeInChrome.js";
import { registerDebugSkill } from "./debug.js";
import { registerKeybindingsSkill } from "./keybindings.js";
import { registerLoremIpsumSkill } from "./loremIpsum.js";
import { registerRememberSkill } from "./remember.js";
import { registerSimplifySkill } from "./simplify.js";
import { registerSkillifySkill } from "./skillify.js";
import { registerStuckSkill } from "./stuck.js";
import { registerUpdateConfigSkill } from "./updateConfig.js";
import { registerVerifySkill } from "./verify.js";
function initBundledSkills() {
  registerUpdateConfigSkill();
  registerKeybindingsSkill();
  registerVerifySkill();
  registerDebugSkill();
  registerLoremIpsumSkill();
  registerSkillifySkill();
  registerRememberSkill();
  registerSimplifySkill();
  registerBatchSkill();
  registerStuckSkill();
  if (false) {
    const { registerDreamSkill } = null;
    registerDreamSkill();
  }
  if (false) {
    const { registerHunterSkill } = null;
    registerHunterSkill();
  }
  if (false) {
    const { registerLoopSkill } = null;
    registerLoopSkill();
  }
  if (false) {
    const {
      registerScheduleRemoteAgentsSkill
    } = null;
    registerScheduleRemoteAgentsSkill();
  }
  if (false) {
    const { registerClaudeApiSkill } = null;
    registerClaudeApiSkill();
  }
  if (shouldAutoEnableClaudeInChrome()) {
    registerClaudeInChromeSkill();
  }
  if (false) {
    const { registerRunSkillGeneratorSkill } = null;
    registerRunSkillGeneratorSkill();
  }
}
export {
  initBundledSkills
};
