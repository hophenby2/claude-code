import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Text } from "../../ink.js";
import { formatDuration } from "../../utils/format.js";
function ShellTimeDisplay(t0) {
  const $ = _c(10);
  const {
    elapsedTimeSeconds,
    timeoutMs
  } = t0;
  if (elapsedTimeSeconds === void 0 && !timeoutMs) {
    return null;
  }
  let t1;
  if ($[0] !== timeoutMs) {
    t1 = timeoutMs ? formatDuration(timeoutMs, {
      hideTrailingZeros: true
    }) : void 0;
    $[0] = timeoutMs;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const timeout = t1;
  if (elapsedTimeSeconds === void 0) {
    const t22 = `(timeout ${timeout})`;
    let t32;
    if ($[2] !== t22) {
      t32 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: t22 });
      $[2] = t22;
      $[3] = t32;
    } else {
      t32 = $[3];
    }
    return t32;
  }
  const t2 = elapsedTimeSeconds * 1e3;
  let t3;
  if ($[4] !== t2) {
    t3 = formatDuration(t2);
    $[4] = t2;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  const elapsed = t3;
  if (timeout) {
    const t42 = `(${elapsed} \xB7 timeout ${timeout})`;
    let t52;
    if ($[6] !== t42) {
      t52 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: t42 });
      $[6] = t42;
      $[7] = t52;
    } else {
      t52 = $[7];
    }
    return t52;
  }
  const t4 = `(${elapsed})`;
  let t5;
  if ($[8] !== t4) {
    t5 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: t4 });
    $[8] = t4;
    $[9] = t5;
  } else {
    t5 = $[9];
  }
  return t5;
}
export {
  ShellTimeDisplay
};
