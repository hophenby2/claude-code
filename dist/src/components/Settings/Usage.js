import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import * as React from "react";
import { useEffect, useState } from "react";
import { extraUsage as extraUsageCommand } from "../../commands/extra-usage/index.js";
import { formatCost } from "../../cost-tracker.js";
import { getSubscriptionType } from "../../utils/auth.js";
import { useTerminalSize } from "../../hooks/useTerminalSize.js";
import { Box, Text } from "../../ink.js";
import { useKeybinding } from "../../keybindings/useKeybinding.js";
import { fetchUtilization } from "../../services/api/usage.js";
import { formatResetText } from "../../utils/format.js";
import { logError } from "../../utils/log.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import { ConfigurableShortcutHint } from "../ConfigurableShortcutHint.js";
import { Byline } from "../design-system/Byline.js";
import { ProgressBar } from "../design-system/ProgressBar.js";
import { isEligibleForOverageCreditGrant, OverageCreditUpsell } from "../LogoV2/OverageCreditUpsell.js";
function LimitBar(t0) {
  const $ = _c(34);
  const {
    title,
    limit,
    maxWidth,
    showTimeInReset: t1,
    extraSubtext
  } = t0;
  const showTimeInReset = t1 === void 0 ? true : t1;
  const {
    utilization,
    resets_at
  } = limit;
  if (utilization === null) {
    return null;
  }
  const usedText = `${Math.floor(utilization)}% used`;
  let subtext;
  if (resets_at) {
    let t2;
    if ($[0] !== resets_at || $[1] !== showTimeInReset) {
      t2 = formatResetText(resets_at, true, showTimeInReset);
      $[0] = resets_at;
      $[1] = showTimeInReset;
      $[2] = t2;
    } else {
      t2 = $[2];
    }
    subtext = `Resets ${t2}`;
  }
  if (extraSubtext) {
    if (subtext) {
      subtext = `${extraSubtext} \xB7 ${subtext}`;
    } else {
      subtext = extraSubtext;
    }
  }
  if (maxWidth >= 62) {
    let t2;
    if ($[3] !== title) {
      t2 = /* @__PURE__ */ jsx(Text, { bold: true, children: title });
      $[3] = title;
      $[4] = t2;
    } else {
      t2 = $[4];
    }
    const t3 = utilization / 100;
    let t4;
    if ($[5] !== t3) {
      t4 = /* @__PURE__ */ jsx(ProgressBar, { ratio: t3, width: 50, fillColor: "rate_limit_fill", emptyColor: "rate_limit_empty" });
      $[5] = t3;
      $[6] = t4;
    } else {
      t4 = $[6];
    }
    let t5;
    if ($[7] !== usedText) {
      t5 = /* @__PURE__ */ jsx(Text, { children: usedText });
      $[7] = usedText;
      $[8] = t5;
    } else {
      t5 = $[8];
    }
    let t6;
    if ($[9] !== t4 || $[10] !== t5) {
      t6 = /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 1, children: [
        t4,
        t5
      ] });
      $[9] = t4;
      $[10] = t5;
      $[11] = t6;
    } else {
      t6 = $[11];
    }
    let t7;
    if ($[12] !== subtext) {
      t7 = subtext && /* @__PURE__ */ jsx(Text, { dimColor: true, children: subtext });
      $[12] = subtext;
      $[13] = t7;
    } else {
      t7 = $[13];
    }
    let t8;
    if ($[14] !== t2 || $[15] !== t6 || $[16] !== t7) {
      t8 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        t2,
        t6,
        t7
      ] });
      $[14] = t2;
      $[15] = t6;
      $[16] = t7;
      $[17] = t8;
    } else {
      t8 = $[17];
    }
    return t8;
  } else {
    let t2;
    if ($[18] !== title) {
      t2 = /* @__PURE__ */ jsx(Text, { bold: true, children: title });
      $[18] = title;
      $[19] = t2;
    } else {
      t2 = $[19];
    }
    let t3;
    if ($[20] !== subtext) {
      t3 = subtext && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Text, { children: " " }),
        /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          "\xB7 ",
          subtext
        ] })
      ] });
      $[20] = subtext;
      $[21] = t3;
    } else {
      t3 = $[21];
    }
    let t4;
    if ($[22] !== t2 || $[23] !== t3) {
      t4 = /* @__PURE__ */ jsxs(Text, { children: [
        t2,
        t3
      ] });
      $[22] = t2;
      $[23] = t3;
      $[24] = t4;
    } else {
      t4 = $[24];
    }
    const t5 = utilization / 100;
    let t6;
    if ($[25] !== maxWidth || $[26] !== t5) {
      t6 = /* @__PURE__ */ jsx(ProgressBar, { ratio: t5, width: maxWidth, fillColor: "rate_limit_fill", emptyColor: "rate_limit_empty" });
      $[25] = maxWidth;
      $[26] = t5;
      $[27] = t6;
    } else {
      t6 = $[27];
    }
    let t7;
    if ($[28] !== usedText) {
      t7 = /* @__PURE__ */ jsx(Text, { children: usedText });
      $[28] = usedText;
      $[29] = t7;
    } else {
      t7 = $[29];
    }
    let t8;
    if ($[30] !== t4 || $[31] !== t6 || $[32] !== t7) {
      t8 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        t4,
        t6,
        t7
      ] });
      $[30] = t4;
      $[31] = t6;
      $[32] = t7;
      $[33] = t8;
    } else {
      t8 = $[33];
    }
    return t8;
  }
}
function Usage() {
  const [utilization, setUtilization] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const {
    columns
  } = useTerminalSize();
  const availableWidth = columns - 2;
  const maxWidth = Math.min(availableWidth, 80);
  const loadUtilization = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchUtilization();
      setUtilization(data);
    } catch (err) {
      logError(err);
      const axiosError = err;
      const responseBody = axiosError.response?.data ? jsonStringify(axiosError.response.data) : void 0;
      setError(responseBody ? `Failed to load usage data: ${responseBody}` : "Failed to load usage data");
    } finally {
      setIsLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadUtilization();
  }, [loadUtilization]);
  useKeybinding("settings:retry", () => {
    void loadUtilization();
  }, {
    context: "Settings",
    isActive: !!error && !isLoading
  });
  if (error) {
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
      /* @__PURE__ */ jsxs(Text, { color: "error", children: [
        "Error: ",
        error
      ] }),
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsxs(Byline, { children: [
        /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "settings:retry", context: "Settings", fallback: "r", description: "retry" }),
        /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Settings", fallback: "Esc", description: "cancel" })
      ] }) })
    ] });
  }
  if (!utilization) {
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Loading usage data\u2026" }),
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Settings", fallback: "Esc", description: "cancel" }) })
    ] });
  }
  const subscriptionType = getSubscriptionType();
  const showSonnetBar = subscriptionType === "max" || subscriptionType === "team" || subscriptionType === null;
  const limits = [{
    title: "Current session",
    limit: utilization.five_hour
  }, {
    title: "Current week (all models)",
    limit: utilization.seven_day
  }, ...showSonnetBar ? [{
    title: "Current week (Sonnet only)",
    limit: utilization.seven_day_sonnet
  }] : []];
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, width: "100%", children: [
    limits.some(({
      limit
    }) => limit) || /* @__PURE__ */ jsx(Text, { dimColor: true, children: "/usage is only available for subscription plans." }),
    limits.map(({
      title,
      limit: limit_0
    }) => limit_0 && /* @__PURE__ */ jsx(LimitBar, { title, limit: limit_0, maxWidth }, title)),
    utilization.extra_usage && /* @__PURE__ */ jsx(ExtraUsageSection, { extraUsage: utilization.extra_usage, maxWidth }),
    isEligibleForOverageCreditGrant() && /* @__PURE__ */ jsx(OverageCreditUpsell, { maxWidth }),
    /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Settings", fallback: "Esc", description: "cancel" }) })
  ] });
}
const EXTRA_USAGE_SECTION_TITLE = "Extra usage";
function ExtraUsageSection(t0) {
  const $ = _c(20);
  const {
    extraUsage,
    maxWidth
  } = t0;
  const subscriptionType = getSubscriptionType();
  const isProOrMax = subscriptionType === "pro" || subscriptionType === "max";
  if (!isProOrMax) {
    return false;
  }
  if (!extraUsage.is_enabled) {
    if (extraUsageCommand.isEnabled()) {
      let t12;
      if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t12 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
          /* @__PURE__ */ jsx(Text, { bold: true, children: EXTRA_USAGE_SECTION_TITLE }),
          /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Extra usage not enabled \xB7 /extra-usage to enable" })
        ] });
        $[0] = t12;
      } else {
        t12 = $[0];
      }
      return t12;
    }
    return null;
  }
  if (extraUsage.monthly_limit === null) {
    let t12;
    if ($[1] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t12 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        /* @__PURE__ */ jsx(Text, { bold: true, children: EXTRA_USAGE_SECTION_TITLE }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Unlimited" })
      ] });
      $[1] = t12;
    } else {
      t12 = $[1];
    }
    return t12;
  }
  if (typeof extraUsage.used_credits !== "number" || typeof extraUsage.utilization !== "number") {
    return null;
  }
  const t1 = extraUsage.used_credits / 100;
  let t2;
  if ($[2] !== t1) {
    t2 = formatCost(t1, 2);
    $[2] = t1;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  const formattedUsedCredits = t2;
  const t3 = extraUsage.monthly_limit / 100;
  let t4;
  if ($[4] !== t3) {
    t4 = formatCost(t3, 2);
    $[4] = t3;
    $[5] = t4;
  } else {
    t4 = $[5];
  }
  const formattedMonthlyLimit = t4;
  let T0;
  let t5;
  let t6;
  let t7;
  if ($[6] !== extraUsage.utilization) {
    const now = /* @__PURE__ */ new Date();
    const oneMonthReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    T0 = LimitBar;
    t7 = EXTRA_USAGE_SECTION_TITLE;
    t5 = extraUsage.utilization;
    t6 = oneMonthReset.toISOString();
    $[6] = extraUsage.utilization;
    $[7] = T0;
    $[8] = t5;
    $[9] = t6;
    $[10] = t7;
  } else {
    T0 = $[7];
    t5 = $[8];
    t6 = $[9];
    t7 = $[10];
  }
  let t8;
  if ($[11] !== t5 || $[12] !== t6) {
    t8 = {
      utilization: t5,
      resets_at: t6
    };
    $[11] = t5;
    $[12] = t6;
    $[13] = t8;
  } else {
    t8 = $[13];
  }
  const t9 = `${formattedUsedCredits} / ${formattedMonthlyLimit} spent`;
  let t10;
  if ($[14] !== T0 || $[15] !== maxWidth || $[16] !== t7 || $[17] !== t8 || $[18] !== t9) {
    t10 = /* @__PURE__ */ jsx(T0, { title: t7, limit: t8, showTimeInReset: false, extraSubtext: t9, maxWidth });
    $[14] = T0;
    $[15] = maxWidth;
    $[16] = t7;
    $[17] = t8;
    $[18] = t9;
    $[19] = t10;
  } else {
    t10 = $[19];
  }
  return t10;
}
export {
  Usage
};
