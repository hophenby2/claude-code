import alias from "./alias.js";
import nohup from "./nohup.js";
import pyright from "./pyright.js";
import sleep from "./sleep.js";
import srun from "./srun.js";
import time from "./time.js";
import timeout from "./timeout.js";
var specs_default = [
  pyright,
  timeout,
  sleep,
  alias,
  nohup,
  time,
  srun
];
export {
  specs_default as default
};
