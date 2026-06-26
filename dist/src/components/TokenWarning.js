import { jsx } from "react/jsx-runtime";
import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
import { c as _c } from "react/compiler-runtime";
const feature = (_name) => false;
import { useSyncExternalStore } from "react";
import { Box, Text } from "../ink.js";
import "../services/analytics/growthbook.js";
import { calculateTokenWarningState, getEffectiveContextWindowSize, isAutoCompactEnabled } from "../services/compact/autoCompact.js";
import { useCompactWarningSuppression } from "../services/compact/compactWarningHook.js";
import { getUpgradeMessage } from "../utils/model/contextWindowUpgradeCheck.js";
function CollapseLabel(t0) {
  const $ = _c(8);
  const {
    upgradeMessage
  } = t0;
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = require2("../services/contextCollapse/index.js");
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const {
    getStats,
    subscribe
  } = t1;
  let t2;
  if ($[1] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = () => {
      const s = getStats();
      const idleWarn = s.health.emptySpawnWarningEmitted ? 1 : 0;
      return `${s.collapsedSpans}|${s.stagedSpans}|${s.health.totalErrors}|${s.health.totalEmptySpawns}|${idleWarn}`;
    };
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  const snapshot = useSyncExternalStore(subscribe, t2);
  let t3;
  if ($[2] !== snapshot) {
    t3 = snapshot.split("|").map(Number);
    $[2] = snapshot;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  const [collapsed, staged, errors, emptySpawns, idleWarn_0] = t3;
  const total = collapsed + staged;
  if (errors > 0 || idleWarn_0) {
    const problem = errors > 0 ? `collapse errors: ${errors}` : `collapse idle (${emptySpawns} empty runs)`;
    const t42 = total > 0 ? `${collapsed} / ${total} summarized \xB7 ${problem}` : problem;
    let t52;
    if ($[4] !== t42) {
      t52 = /* @__PURE__ */ jsx(Text, { color: "warning", wrap: "truncate", children: t42 });
      $[4] = t42;
      $[5] = t52;
    } else {
      t52 = $[5];
    }
    return t52;
  }
  if (total === 0) {
    return null;
  }
  const label = `${collapsed} / ${total} summarized`;
  const t4 = upgradeMessage ? `${label} \xB7 ${upgradeMessage}` : label;
  let t5;
  if ($[6] !== t4) {
    t5 = /* @__PURE__ */ jsx(Text, { dimColor: true, wrap: "truncate", children: t4 });
    $[6] = t4;
    $[7] = t5;
  } else {
    t5 = $[7];
  }
  return t5;
}
function TokenWarning(t0) {
  const $ = _c(13);
  const {
    tokenUsage,
    model
  } = t0;
  let t1;
  if ($[0] !== model || $[1] !== tokenUsage) {
    t1 = calculateTokenWarningState(tokenUsage, model);
    $[0] = model;
    $[1] = tokenUsage;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  const {
    percentLeft,
    isAboveWarningThreshold,
    isAboveErrorThreshold
  } = t1;
  const suppressWarning = useCompactWarningSuppression();
  if (!isAboveWarningThreshold || suppressWarning) {
    return null;
  }
  let t2;
  if ($[3] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = isAutoCompactEnabled();
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  const showAutoCompactWarning = t2;
  let t3;
  if ($[4] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t3 = getUpgradeMessage("warning");
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  const upgradeMessage = t3;
  let displayPercentLeft = percentLeft;
  let reactiveOnlyMode = false;
  let collapseMode = false;
  if (false) {
    if (getFeatureValue_CACHED_MAY_BE_STALE("tengu_cobalt_raccoon", false)) {
      reactiveOnlyMode = true;
    }
  }
  if (false) {
    const {
      isContextCollapseEnabled
    } = require2("../services/contextCollapse/index.js");
    if (isContextCollapseEnabled()) {
      collapseMode = true;
    }
  }
  if (reactiveOnlyMode || collapseMode) {
    const effectiveWindow = getEffectiveContextWindowSize(model);
    let t42;
    if ($[5] !== effectiveWindow || $[6] !== tokenUsage) {
      t42 = Math.round((effectiveWindow - tokenUsage) / effectiveWindow * 100);
      $[5] = effectiveWindow;
      $[6] = tokenUsage;
      $[7] = t42;
    } else {
      t42 = $[7];
    }
    displayPercentLeft = Math.max(0, t42);
  }
  if (collapseMode && false) {
    let t42;
    if ($[8] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t42 = /* @__PURE__ */ jsx(Box, { flexDirection: "row", children: /* @__PURE__ */ jsx(CollapseLabel, { upgradeMessage }) });
      $[8] = t42;
    } else {
      t42 = $[8];
    }
    return t42;
  }
  const autocompactLabel = reactiveOnlyMode ? `${100 - displayPercentLeft}% context used` : `${displayPercentLeft}% until auto-compact`;
  let t4;
  if ($[9] !== autocompactLabel || $[10] !== isAboveErrorThreshold || $[11] !== percentLeft) {
    t4 = /* @__PURE__ */ jsx(Box, { flexDirection: "row", children: showAutoCompactWarning ? /* @__PURE__ */ jsx(Text, { dimColor: true, wrap: "truncate", children: upgradeMessage ? `${autocompactLabel} \xB7 ${upgradeMessage}` : autocompactLabel }) : /* @__PURE__ */ jsx(Text, { color: isAboveErrorThreshold ? "error" : "warning", wrap: "truncate", children: upgradeMessage ? `Context low (${percentLeft}% remaining) \xB7 ${upgradeMessage}` : `Context low (${percentLeft}% remaining) \xB7 Run /compact to compact & continue` }) });
    $[9] = autocompactLabel;
    $[10] = isAboveErrorThreshold;
    $[11] = percentLeft;
    $[12] = t4;
  } else {
    t4 = $[12];
  }
  return t4;
}
export {
  TokenWarning
};
