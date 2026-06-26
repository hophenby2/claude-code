import { jsx } from "react/jsx-runtime";
import { SkillsMenu } from "../../components/skills/SkillsMenu.js";
async function call(onDone, context) {
  return /* @__PURE__ */ jsx(SkillsMenu, { onExit: onDone, commands: context.options.commands });
}
export {
  call
};
