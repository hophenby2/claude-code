import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Box } from "../ink.js";
import { BashTool } from "../tools/BashTool/BashTool.js";
import { UserBashInputMessage } from "./messages/UserBashInputMessage.js";
import { ShellProgressMessage } from "./shell/ShellProgressMessage.js";
function BashModeProgress(t0) {
  const $ = _c(8);
  const {
    input,
    progress,
    verbose
  } = t0;
  const t1 = `<bash-input>${input}</bash-input>`;
  let t2;
  if ($[0] !== t1) {
    t2 = /* @__PURE__ */ jsx(UserBashInputMessage, { addMargin: false, param: {
      text: t1,
      type: "text"
    } });
    $[0] = t1;
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  let t3;
  if ($[2] !== progress || $[3] !== verbose) {
    t3 = progress ? /* @__PURE__ */ jsx(ShellProgressMessage, { fullOutput: progress.fullOutput, output: progress.output, elapsedTimeSeconds: progress.elapsedTimeSeconds, totalLines: progress.totalLines, verbose }) : BashTool.renderToolUseProgressMessage?.([], {
      verbose,
      tools: [],
      terminalSize: void 0
    });
    $[2] = progress;
    $[3] = verbose;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  let t4;
  if ($[5] !== t2 || $[6] !== t3) {
    t4 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
      t2,
      t3
    ] });
    $[5] = t2;
    $[6] = t3;
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  return t4;
}
export {
  BashModeProgress
};
