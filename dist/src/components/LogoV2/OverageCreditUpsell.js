import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { useState } from "react";
import { Text } from "../../ink.js";
import { logEvent } from "../../services/analytics/index.js";
import { formatGrantAmount, getCachedOverageCreditGrant, refreshOverageCreditGrantCache } from "../../services/api/overageCreditGrant.js";
import { getGlobalConfig, saveGlobalConfig } from "../../utils/config.js";
import { truncate } from "../../utils/format.js";
const MAX_IMPRESSIONS = 3;
function isEligibleForOverageCreditGrant() {
  const info = getCachedOverageCreditGrant();
  if (!info || !info.available || info.granted) return false;
  return formatGrantAmount(info) !== null;
}
function shouldShowOverageCreditUpsell() {
  if (!isEligibleForOverageCreditGrant()) return false;
  const config = getGlobalConfig();
  if (config.hasVisitedExtraUsage) return false;
  if ((config.overageCreditUpsellSeenCount ?? 0) >= MAX_IMPRESSIONS) return false;
  return true;
}
function maybeRefreshOverageCreditCache() {
  if (getCachedOverageCreditGrant() !== null) return;
  void refreshOverageCreditGrantCache();
}
function useShowOverageCreditUpsell() {
  const [show] = useState(_temp);
  return show;
}
function _temp() {
  maybeRefreshOverageCreditCache();
  return shouldShowOverageCreditUpsell();
}
function incrementOverageCreditUpsellSeenCount() {
  let newCount = 0;
  saveGlobalConfig((prev) => {
    newCount = (prev.overageCreditUpsellSeenCount ?? 0) + 1;
    return {
      ...prev,
      overageCreditUpsellSeenCount: newCount
    };
  });
  logEvent("tengu_overage_credit_upsell_shown", {
    seen_count: newCount
  });
}
function getUsageText(amount) {
  return `${amount} in extra usage for third-party apps \xB7 /extra-usage`;
}
const FEED_SUBTITLE = "On us. Works on third-party apps \xB7 /extra-usage";
function getFeedTitle(amount) {
  return `${amount} in extra usage`;
}
function OverageCreditUpsell(t0) {
  const $ = _c(8);
  const {
    maxWidth,
    twoLine
  } = t0;
  let t1;
  let t2;
  if ($[0] !== maxWidth || $[1] !== twoLine) {
    t2 = /* @__PURE__ */ Symbol.for("react.early_return_sentinel");
    bb0: {
      const info = getCachedOverageCreditGrant();
      if (!info) {
        t2 = null;
        break bb0;
      }
      const amount = formatGrantAmount(info);
      if (!amount) {
        t2 = null;
        break bb0;
      }
      if (twoLine) {
        const title = getFeedTitle(amount);
        let t3;
        if ($[4] !== maxWidth) {
          t3 = maxWidth ? truncate(FEED_SUBTITLE, maxWidth) : FEED_SUBTITLE;
          $[4] = maxWidth;
          $[5] = t3;
        } else {
          t3 = $[5];
        }
        let t4;
        if ($[6] !== t3) {
          t4 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: t3 });
          $[6] = t3;
          $[7] = t4;
        } else {
          t4 = $[7];
        }
        t2 = /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { color: "claude", children: maxWidth ? truncate(title, maxWidth) : title }),
          t4
        ] });
        break bb0;
      }
      const text = getUsageText(amount);
      const display = maxWidth ? truncate(text, maxWidth) : text;
      const highlightLen = Math.min(getFeedTitle(amount).length, display.length);
      t1 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        /* @__PURE__ */ jsx(Text, { color: "claude", children: display.slice(0, highlightLen) }),
        display.slice(highlightLen)
      ] });
    }
    $[0] = maxWidth;
    $[1] = twoLine;
    $[2] = t1;
    $[3] = t2;
  } else {
    t1 = $[2];
    t2 = $[3];
  }
  if (t2 !== /* @__PURE__ */ Symbol.for("react.early_return_sentinel")) {
    return t2;
  }
  return t1;
}
function createOverageCreditFeed() {
  const info = getCachedOverageCreditGrant();
  const amount = info ? formatGrantAmount(info) : null;
  const title = amount ? getFeedTitle(amount) : "extra usage credit";
  return {
    title,
    lines: [],
    customContent: {
      content: /* @__PURE__ */ jsx(Text, { dimColor: true, children: FEED_SUBTITLE }),
      width: Math.max(title.length, FEED_SUBTITLE.length)
    }
  };
}
export {
  OverageCreditUpsell,
  createOverageCreditFeed,
  incrementOverageCreditUpsellSeenCount,
  isEligibleForOverageCreditGrant,
  maybeRefreshOverageCreditCache,
  shouldShowOverageCreditUpsell,
  useShowOverageCreditUpsell
};
