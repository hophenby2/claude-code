import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import stripAnsi from "strip-ansi";
import { Box, Text } from "../../ink.js";
import { formatFileSize } from "../../utils/format.js";
import { MessageResponse } from "../MessageResponse.js";
import { OffscreenFreeze } from "../OffscreenFreeze.js";
import { ShellTimeDisplay } from "./ShellTimeDisplay.js";
function ShellProgressMessage(t0) {
  const $ = _c(30);
  const {
    output,
    fullOutput,
    elapsedTimeSeconds,
    totalLines,
    totalBytes,
    timeoutMs,
    verbose
  } = t0;
  let t1;
  if ($[0] !== fullOutput) {
    t1 = stripAnsi(fullOutput.trim());
    $[0] = fullOutput;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const strippedFullOutput = t1;
  let lines;
  let t2;
  if ($[2] !== output || $[3] !== strippedFullOutput || $[4] !== verbose) {
    const strippedOutput = stripAnsi(output.trim());
    lines = strippedOutput.split("\n").filter(_temp);
    t2 = verbose ? strippedFullOutput : lines.slice(-5).join("\n");
    $[2] = output;
    $[3] = strippedFullOutput;
    $[4] = verbose;
    $[5] = lines;
    $[6] = t2;
  } else {
    lines = $[5];
    t2 = $[6];
  }
  const displayLines = t2;
  if (!lines.length) {
    let t32;
    if ($[7] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t32 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Running\u2026 " });
      $[7] = t32;
    } else {
      t32 = $[7];
    }
    let t42;
    if ($[8] !== elapsedTimeSeconds || $[9] !== timeoutMs) {
      t42 = /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(OffscreenFreeze, { children: [
        t32,
        /* @__PURE__ */ jsx(ShellTimeDisplay, { elapsedTimeSeconds, timeoutMs })
      ] }) });
      $[8] = elapsedTimeSeconds;
      $[9] = timeoutMs;
      $[10] = t42;
    } else {
      t42 = $[10];
    }
    return t42;
  }
  const extraLines = totalLines ? Math.max(0, totalLines - 5) : 0;
  let lineStatus = "";
  if (!verbose && totalBytes && totalLines) {
    lineStatus = `~${totalLines} lines`;
  } else {
    if (!verbose && extraLines > 0) {
      lineStatus = `+${extraLines} lines`;
    }
  }
  const t3 = verbose ? void 0 : Math.min(5, lines.length);
  let t4;
  if ($[11] !== displayLines) {
    t4 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: displayLines });
    $[11] = displayLines;
    $[12] = t4;
  } else {
    t4 = $[12];
  }
  let t5;
  if ($[13] !== t3 || $[14] !== t4) {
    t5 = /* @__PURE__ */ jsx(Box, { height: t3, flexDirection: "column", overflow: "hidden", children: t4 });
    $[13] = t3;
    $[14] = t4;
    $[15] = t5;
  } else {
    t5 = $[15];
  }
  let t6;
  if ($[16] !== lineStatus) {
    t6 = lineStatus ? /* @__PURE__ */ jsx(Text, { dimColor: true, children: lineStatus }) : null;
    $[16] = lineStatus;
    $[17] = t6;
  } else {
    t6 = $[17];
  }
  let t7;
  if ($[18] !== elapsedTimeSeconds || $[19] !== timeoutMs) {
    t7 = /* @__PURE__ */ jsx(ShellTimeDisplay, { elapsedTimeSeconds, timeoutMs });
    $[18] = elapsedTimeSeconds;
    $[19] = timeoutMs;
    $[20] = t7;
  } else {
    t7 = $[20];
  }
  let t8;
  if ($[21] !== totalBytes) {
    t8 = totalBytes ? /* @__PURE__ */ jsx(Text, { dimColor: true, children: formatFileSize(totalBytes) }) : null;
    $[21] = totalBytes;
    $[22] = t8;
  } else {
    t8 = $[22];
  }
  let t9;
  if ($[23] !== t6 || $[24] !== t7 || $[25] !== t8) {
    t9 = /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 1, children: [
      t6,
      t7,
      t8
    ] });
    $[23] = t6;
    $[24] = t7;
    $[25] = t8;
    $[26] = t9;
  } else {
    t9 = $[26];
  }
  let t10;
  if ($[27] !== t5 || $[28] !== t9) {
    t10 = /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(OffscreenFreeze, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      t5,
      t9
    ] }) }) });
    $[27] = t5;
    $[28] = t9;
    $[29] = t10;
  } else {
    t10 = $[29];
  }
  return t10;
}
function _temp(line) {
  return line;
}
export {
  ShellProgressMessage
};
