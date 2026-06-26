import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { useState } from "react";
import { Text } from "../../ink.js";
import { logEvent } from "../../services/analytics/index.js";
import { checkCachedPassesEligibility, formatCreditAmount, getCachedReferrerReward, getCachedRemainingPasses } from "../../services/api/referral.js";
import { getGlobalConfig, saveGlobalConfig } from "../../utils/config.js";
function resetIfPassesRefreshed() {
  const remaining = getCachedRemainingPasses();
  if (remaining == null || remaining <= 0) return;
  const config = getGlobalConfig();
  const lastSeen = config.passesLastSeenRemaining ?? 0;
  if (remaining > lastSeen) {
    saveGlobalConfig((prev) => ({
      ...prev,
      passesUpsellSeenCount: 0,
      hasVisitedPasses: false,
      passesLastSeenRemaining: remaining
    }));
  }
}
function shouldShowGuestPassesUpsell() {
  const {
    eligible,
    hasCache
  } = checkCachedPassesEligibility();
  if (!eligible || !hasCache) return false;
  resetIfPassesRefreshed();
  const config = getGlobalConfig();
  if ((config.passesUpsellSeenCount ?? 0) >= 3) return false;
  if (config.hasVisitedPasses) return false;
  return true;
}
function useShowGuestPassesUpsell() {
  const [show] = useState(_temp);
  return show;
}
function _temp() {
  return shouldShowGuestPassesUpsell();
}
function incrementGuestPassesSeenCount() {
  let newCount = 0;
  saveGlobalConfig((prev) => {
    newCount = (prev.passesUpsellSeenCount ?? 0) + 1;
    return {
      ...prev,
      passesUpsellSeenCount: newCount
    };
  });
  logEvent("tengu_guest_passes_upsell_shown", {
    seen_count: newCount
  });
}
function GuestPassesUpsell() {
  const $ = _c(1);
  let t0;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    const reward = getCachedReferrerReward();
    t0 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      /* @__PURE__ */ jsx(Text, { color: "claude", children: "[\u273B]" }),
      " ",
      /* @__PURE__ */ jsx(Text, { color: "claude", children: "[\u273B]" }),
      " ",
      /* @__PURE__ */ jsx(Text, { color: "claude", children: "[\u273B]" }),
      " \xB7",
      " ",
      reward ? `Share Claude Code and earn ${formatCreditAmount(reward)} of extra usage \xB7 /passes` : "3 guest passes at /passes"
    ] });
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  return t0;
}
export {
  GuestPassesUpsell,
  incrementGuestPassesSeenCount,
  useShowGuestPassesUpsell
};
