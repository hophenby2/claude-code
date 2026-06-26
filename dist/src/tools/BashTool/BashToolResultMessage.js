import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { removeSandboxViolationTags } from "../../utils/sandbox/sandbox-ui-utils.js";
import { KeyboardShortcutHint } from "../../components/design-system/KeyboardShortcutHint.js";
import { MessageResponse } from "../../components/MessageResponse.js";
import { OutputLine } from "../../components/shell/OutputLine.js";
import { ShellTimeDisplay } from "../../components/shell/ShellTimeDisplay.js";
import { Box, Text } from "../../ink.js";
const SHELL_CWD_RESET_PATTERN = /(?:^|\n)(Shell cwd was reset to .+)$/;
function extractSandboxViolations(stderr) {
  const violationsMatch = stderr.match(/<sandbox_violations>([\s\S]*?)<\/sandbox_violations>/);
  if (!violationsMatch) {
    return {
      cleanedStderr: stderr
    };
  }
  const cleanedStderr = removeSandboxViolationTags(stderr).trim();
  return {
    cleanedStderr
  };
}
function extractCwdResetWarning(stderr) {
  const match = stderr.match(SHELL_CWD_RESET_PATTERN);
  if (!match) {
    return {
      cleanedStderr: stderr,
      cwdResetWarning: null
    };
  }
  const cwdResetWarning = match[1] ?? null;
  const cleanedStderr = stderr.replace(SHELL_CWD_RESET_PATTERN, "").trim();
  return {
    cleanedStderr,
    cwdResetWarning
  };
}
function BashToolResultMessage(t0) {
  const $ = _c(34);
  const {
    content: t1,
    verbose,
    timeoutMs
  } = t0;
  const {
    stdout: t2,
    stderr: t3,
    isImage,
    returnCodeInterpretation,
    noOutputExpected,
    backgroundTaskId
  } = t1;
  const stdout = t2 === void 0 ? "" : t2;
  const stdErrWithViolations = t3 === void 0 ? "" : t3;
  let T0;
  let cwdResetWarning;
  let stderr;
  let t4;
  let t5;
  let t6;
  let t7;
  if ($[0] !== isImage || $[1] !== stdErrWithViolations || $[2] !== stdout || $[3] !== verbose) {
    t7 = /* @__PURE__ */ Symbol.for("react.early_return_sentinel");
    bb0: {
      const {
        cleanedStderr: stderrWithoutViolations
      } = extractSandboxViolations(stdErrWithViolations);
      ({
        cleanedStderr: stderr,
        cwdResetWarning
      } = extractCwdResetWarning(stderrWithoutViolations));
      if (isImage) {
        let t82;
        if ($[11] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
          t82 = /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "[Image data detected and sent to Claude]" }) });
          $[11] = t82;
        } else {
          t82 = $[11];
        }
        t7 = t82;
        break bb0;
      }
      T0 = Box;
      t4 = "column";
      if ($[12] !== stdout || $[13] !== verbose) {
        t5 = stdout !== "" ? /* @__PURE__ */ jsx(OutputLine, { content: stdout, verbose }) : null;
        $[12] = stdout;
        $[13] = verbose;
        $[14] = t5;
      } else {
        t5 = $[14];
      }
      t6 = stderr.trim() !== "" ? /* @__PURE__ */ jsx(OutputLine, { content: stderr, verbose, isError: true }) : null;
    }
    $[0] = isImage;
    $[1] = stdErrWithViolations;
    $[2] = stdout;
    $[3] = verbose;
    $[4] = T0;
    $[5] = cwdResetWarning;
    $[6] = stderr;
    $[7] = t4;
    $[8] = t5;
    $[9] = t6;
    $[10] = t7;
  } else {
    T0 = $[4];
    cwdResetWarning = $[5];
    stderr = $[6];
    t4 = $[7];
    t5 = $[8];
    t6 = $[9];
    t7 = $[10];
  }
  if (t7 !== /* @__PURE__ */ Symbol.for("react.early_return_sentinel")) {
    return t7;
  }
  let t8;
  if ($[15] !== cwdResetWarning) {
    t8 = cwdResetWarning ? /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: cwdResetWarning }) }) : null;
    $[15] = cwdResetWarning;
    $[16] = t8;
  } else {
    t8 = $[16];
  }
  let t9;
  if ($[17] !== backgroundTaskId || $[18] !== cwdResetWarning || $[19] !== noOutputExpected || $[20] !== returnCodeInterpretation || $[21] !== stderr || $[22] !== stdout) {
    t9 = stdout === "" && stderr.trim() === "" && !cwdResetWarning ? /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: backgroundTaskId ? /* @__PURE__ */ jsxs(Fragment, { children: [
      "Running in the background",
      " ",
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "\u2193", action: "manage", parens: true })
    ] }) : returnCodeInterpretation || (noOutputExpected ? "Done" : "(No output)") }) }) : null;
    $[17] = backgroundTaskId;
    $[18] = cwdResetWarning;
    $[19] = noOutputExpected;
    $[20] = returnCodeInterpretation;
    $[21] = stderr;
    $[22] = stdout;
    $[23] = t9;
  } else {
    t9 = $[23];
  }
  let t10;
  if ($[24] !== timeoutMs) {
    t10 = timeoutMs && /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(ShellTimeDisplay, { timeoutMs }) });
    $[24] = timeoutMs;
    $[25] = t10;
  } else {
    t10 = $[25];
  }
  let t11;
  if ($[26] !== T0 || $[27] !== t10 || $[28] !== t4 || $[29] !== t5 || $[30] !== t6 || $[31] !== t8 || $[32] !== t9) {
    t11 = /* @__PURE__ */ jsxs(T0, { flexDirection: t4, children: [
      t5,
      t6,
      t8,
      t9,
      t10
    ] });
    $[26] = T0;
    $[27] = t10;
    $[28] = t4;
    $[29] = t5;
    $[30] = t6;
    $[31] = t8;
    $[32] = t9;
    $[33] = t11;
  } else {
    t11 = $[33];
  }
  return t11;
}
export {
  BashToolResultMessage as default
};
