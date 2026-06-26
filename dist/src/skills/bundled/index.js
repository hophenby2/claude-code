import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
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
    const { registerDreamSkill } = require2("./dream.js");
    registerDreamSkill();
  }
  if (false) {
    const { registerHunterSkill } = require2("./hunter.js");
    registerHunterSkill();
  }
  if (false) {
    const { registerLoopSkill } = require2("./loop.js");
    registerLoopSkill();
  }
  if (false) {
    const {
      registerScheduleRemoteAgentsSkill
    } = require2("./scheduleRemoteAgents.js");
    registerScheduleRemoteAgentsSkill();
  }
  if (false) {
    const { registerClaudeApiSkill } = require2("./claudeApi.js");
    registerClaudeApiSkill();
  }
  if (shouldAutoEnableClaudeInChrome()) {
    registerClaudeInChromeSkill();
  }
  if (false) {
    const { registerRunSkillGeneratorSkill } = require2("./runSkillGenerator.js");
    registerRunSkillGeneratorSkill();
  }
}
export {
  initBundledSkills
};
