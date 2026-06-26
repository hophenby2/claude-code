import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Box, Text } from "../../ink.js";
import { MessageResponse } from "../MessageResponse.js";
function HookProgressMessage(t0) {
  const $ = _c(22);
  const {
    hookEvent,
    lookups,
    toolUseID,
    isTranscriptMode
  } = t0;
  let t1;
  if ($[0] !== hookEvent || $[1] !== lookups.inProgressHookCounts || $[2] !== toolUseID) {
    t1 = lookups.inProgressHookCounts.get(toolUseID)?.get(hookEvent) ?? 0;
    $[0] = hookEvent;
    $[1] = lookups.inProgressHookCounts;
    $[2] = toolUseID;
    $[3] = t1;
  } else {
    t1 = $[3];
  }
  const inProgressHookCount = t1;
  const resolvedHookCount = lookups.resolvedHookCounts.get(toolUseID)?.get(hookEvent) ?? 0;
  if (inProgressHookCount === 0) {
    return null;
  }
  if (hookEvent === "PreToolUse" || hookEvent === "PostToolUse") {
    if (isTranscriptMode) {
      let t22;
      if ($[4] !== inProgressHookCount) {
        t22 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          inProgressHookCount,
          " "
        ] });
        $[4] = inProgressHookCount;
        $[5] = t22;
      } else {
        t22 = $[5];
      }
      let t32;
      if ($[6] !== hookEvent) {
        t32 = /* @__PURE__ */ jsx(Text, { dimColor: true, bold: true, children: hookEvent });
        $[6] = hookEvent;
        $[7] = t32;
      } else {
        t32 = $[7];
      }
      const t42 = inProgressHookCount === 1 ? " hook" : " hooks";
      let t52;
      if ($[8] !== t42) {
        t52 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          t42,
          " ran"
        ] });
        $[8] = t42;
        $[9] = t52;
      } else {
        t52 = $[9];
      }
      let t62;
      if ($[10] !== t22 || $[11] !== t32 || $[12] !== t52) {
        t62 = /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
          t22,
          t32,
          t52
        ] }) });
        $[10] = t22;
        $[11] = t32;
        $[12] = t52;
        $[13] = t62;
      } else {
        t62 = $[13];
      }
      return t62;
    }
    return null;
  }
  if (resolvedHookCount === inProgressHookCount) {
    return null;
  }
  let t2;
  if ($[14] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Running " });
    $[14] = t2;
  } else {
    t2 = $[14];
  }
  let t3;
  if ($[15] !== hookEvent) {
    t3 = /* @__PURE__ */ jsx(Text, { dimColor: true, bold: true, children: hookEvent });
    $[15] = hookEvent;
    $[16] = t3;
  } else {
    t3 = $[16];
  }
  const t4 = inProgressHookCount === 1 ? " hook\u2026" : " hooks\u2026";
  let t5;
  if ($[17] !== t4) {
    t5 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: t4 });
    $[17] = t4;
    $[18] = t5;
  } else {
    t5 = $[18];
  }
  let t6;
  if ($[19] !== t3 || $[20] !== t5) {
    t6 = /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
      t2,
      t3,
      t5
    ] }) });
    $[19] = t3;
    $[20] = t5;
    $[21] = t6;
  } else {
    t6 = $[21];
  }
  return t6;
}
export {
  HookProgressMessage
};
