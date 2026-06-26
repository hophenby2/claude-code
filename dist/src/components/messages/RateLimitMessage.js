import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { useEffect, useState } from "react";
import { extraUsage } from "../../commands/extra-usage/index.js";
import { Box, Text } from "../../ink.js";
import { useClaudeAiLimits } from "../../services/claudeAiLimitsHook.js";
import { shouldProcessMockLimits } from "../../services/rateLimitMocking.js";
import { getRateLimitTier, getSubscriptionType, isClaudeAISubscriber } from "../../utils/auth.js";
import { hasClaudeAiBillingAccess } from "../../utils/billing.js";
import { MessageResponse } from "../MessageResponse.js";
function getUpsellMessage({
  shouldShowUpsell,
  isMax20x,
  isExtraUsageCommandEnabled,
  shouldAutoOpenRateLimitOptionsMenu,
  isTeamOrEnterprise,
  hasBillingAccess
}) {
  if (!shouldShowUpsell) return null;
  if (isMax20x) {
    if (isExtraUsageCommandEnabled) {
      return "/extra-usage to finish what you\u2019re working on.";
    }
    return "/login to switch to an API usage-billed account.";
  }
  if (shouldAutoOpenRateLimitOptionsMenu) {
    return "Opening your options\u2026";
  }
  if (!isTeamOrEnterprise && !isExtraUsageCommandEnabled) {
    return "/upgrade to increase your usage limit.";
  }
  if (isTeamOrEnterprise) {
    if (!isExtraUsageCommandEnabled) return null;
    if (hasBillingAccess) {
      return "/extra-usage to finish what you\u2019re working on.";
    }
    return "/extra-usage to request more usage from your admin.";
  }
  return "/upgrade or /extra-usage to finish what you\u2019re working on.";
}
function RateLimitMessage(t0) {
  const $ = _c(16);
  const {
    text,
    onOpenRateLimitOptions
  } = t0;
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = getSubscriptionType();
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const subscriptionType = t1;
  let t2;
  if ($[1] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = getRateLimitTier();
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  const rateLimitTier = t2;
  const isTeamOrEnterprise = subscriptionType === "team" || subscriptionType === "enterprise";
  const isMax20x = rateLimitTier === "default_claude_max_20x";
  let t3;
  if ($[2] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t3 = shouldProcessMockLimits() || isClaudeAISubscriber();
    $[2] = t3;
  } else {
    t3 = $[2];
  }
  const shouldShowUpsell = t3;
  const canSeeRateLimitOptionsUpsell = shouldShowUpsell && !isMax20x;
  const [hasOpenedInteractiveMenu, setHasOpenedInteractiveMenu] = useState(false);
  const claudeAiLimits = useClaudeAiLimits();
  const isCurrentlyRateLimited = claudeAiLimits.status === "rejected" && claudeAiLimits.resetsAt !== void 0 && !claudeAiLimits.isUsingOverage;
  const shouldAutoOpenRateLimitOptionsMenu = canSeeRateLimitOptionsUpsell && !hasOpenedInteractiveMenu && isCurrentlyRateLimited && onOpenRateLimitOptions;
  let t4;
  let t5;
  if ($[3] !== onOpenRateLimitOptions || $[4] !== shouldAutoOpenRateLimitOptionsMenu) {
    t4 = () => {
      if (shouldAutoOpenRateLimitOptionsMenu) {
        setHasOpenedInteractiveMenu(true);
        onOpenRateLimitOptions();
      }
    };
    t5 = [shouldAutoOpenRateLimitOptionsMenu, onOpenRateLimitOptions];
    $[3] = onOpenRateLimitOptions;
    $[4] = shouldAutoOpenRateLimitOptionsMenu;
    $[5] = t4;
    $[6] = t5;
  } else {
    t4 = $[5];
    t5 = $[6];
  }
  useEffect(t4, t5);
  let t6;
  bb0: {
    let t72;
    if ($[7] !== shouldAutoOpenRateLimitOptionsMenu) {
      t72 = getUpsellMessage({
        shouldShowUpsell,
        isMax20x,
        isExtraUsageCommandEnabled: extraUsage.isEnabled(),
        shouldAutoOpenRateLimitOptionsMenu: !!shouldAutoOpenRateLimitOptionsMenu,
        isTeamOrEnterprise,
        hasBillingAccess: hasClaudeAiBillingAccess()
      });
      $[7] = shouldAutoOpenRateLimitOptionsMenu;
      $[8] = t72;
    } else {
      t72 = $[8];
    }
    const message = t72;
    if (!message) {
      t6 = null;
      break bb0;
    }
    let t82;
    if ($[9] !== message) {
      t82 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: message });
      $[9] = message;
      $[10] = t82;
    } else {
      t82 = $[10];
    }
    t6 = t82;
  }
  const upsell = t6;
  let t7;
  if ($[11] !== text) {
    t7 = /* @__PURE__ */ jsx(Text, { color: "error", children: text });
    $[11] = text;
    $[12] = t7;
  } else {
    t7 = $[12];
  }
  const t8 = hasOpenedInteractiveMenu ? null : upsell;
  let t9;
  if ($[13] !== t7 || $[14] !== t8) {
    t9 = /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      t7,
      t8
    ] }) });
    $[13] = t7;
    $[14] = t8;
    $[15] = t9;
  } else {
    t9 = $[15];
  }
  return t9;
}
export {
  RateLimitMessage,
  getUpsellMessage
};
