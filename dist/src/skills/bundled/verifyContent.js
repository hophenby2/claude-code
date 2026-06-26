import cliMd from "./verify/examples/cli.md.js";
import serverMd from "./verify/examples/server.md.js";
import skillMd from "./verify/SKILL.md.js";
const SKILL_MD = skillMd;
const SKILL_FILES = {
  "examples/cli.md": cliMd,
  "examples/server.md": serverMd
};
export {
  SKILL_FILES,
  SKILL_MD
};
