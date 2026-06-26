import {
  getOauthAccountInfo,
  getSubscriptionType,
  isOverageProvisioningAllowed
} from "../utils/auth.js";
import { hasClaudeAiBillingAccess } from "../utils/billing.js";
import { formatResetTime } from "../utils/format.js";
const FEEDBACK_CHANNEL_ANT = "#briarpatch-cc";
const RATE_LIMIT_ERROR_PREFIXES = [
  "You've hit your",
  "You've used",
  "You're now using extra usage",
  "You're close to",
  "You're out of extra usage"
];
function isRateLimitErrorMessage(text) {
  return RATE_LIMIT_ERROR_PREFIXES.some((prefix) => text.startsWith(prefix));
}
function getRateLimitMessage(limits, model) {
  if (limits.isUsingOverage) {
    if (limits.overageStatus === "allowed_warning") {
      return {
        message: "You're close to your extra usage spending limit",
        severity: "warning"
      };
    }
    return null;
  }
  if (limits.status === "rejected") {
    return { message: getLimitReachedText(limits, model), severity: "error" };
  }
  if (limits.status === "allowed_warning") {
    const WARNING_THRESHOLD = 0.7;
    if (limits.utilization !== void 0 && limits.utilization < WARNING_THRESHOLD) {
      return null;
    }
    const subscriptionType = getSubscriptionType();
    const isTeamOrEnterprise = subscriptionType === "team" || subscriptionType === "enterprise";
    const hasExtraUsageEnabled = getOauthAccountInfo()?.hasExtraUsageEnabled === true;
    if (isTeamOrEnterprise && hasExtraUsageEnabled && !hasClaudeAiBillingAccess()) {
      return null;
    }
    const text = getEarlyWarningText(limits);
    if (text) {
      return { message: text, severity: "warning" };
    }
  }
  return null;
}
function getRateLimitErrorMessage(limits, model) {
  const message = getRateLimitMessage(limits, model);
  if (message && message.severity === "error") {
    return message.message;
  }
  return null;
}
function getRateLimitWarning(limits, model) {
  const message = getRateLimitMessage(limits, model);
  if (message && message.severity === "warning") {
    return message.message;
  }
  return null;
}
function getLimitReachedText(limits, model) {
  const resetsAt = limits.resetsAt;
  const resetTime = resetsAt ? formatResetTime(resetsAt, true) : void 0;
  const overageResetTime = limits.overageResetsAt ? formatResetTime(limits.overageResetsAt, true) : void 0;
  const resetMessage = resetTime ? ` \xB7 resets ${resetTime}` : "";
  if (limits.overageStatus === "rejected") {
    let overageResetMessage = "";
    if (resetsAt && limits.overageResetsAt) {
      if (resetsAt < limits.overageResetsAt) {
        overageResetMessage = ` \xB7 resets ${resetTime}`;
      } else {
        overageResetMessage = ` \xB7 resets ${overageResetTime}`;
      }
    } else if (resetTime) {
      overageResetMessage = ` \xB7 resets ${resetTime}`;
    } else if (overageResetTime) {
      overageResetMessage = ` \xB7 resets ${overageResetTime}`;
    }
    if (limits.overageDisabledReason === "out_of_credits") {
      return `You're out of extra usage${overageResetMessage}`;
    }
    return formatLimitReachedText("limit", overageResetMessage, model);
  }
  if (limits.rateLimitType === "seven_day_sonnet") {
    const subscriptionType = getSubscriptionType();
    const isProOrEnterprise = subscriptionType === "pro" || subscriptionType === "enterprise";
    const limit = isProOrEnterprise ? "weekly limit" : "Sonnet limit";
    return formatLimitReachedText(limit, resetMessage, model);
  }
  if (limits.rateLimitType === "seven_day_opus") {
    return formatLimitReachedText("Opus limit", resetMessage, model);
  }
  if (limits.rateLimitType === "seven_day") {
    return formatLimitReachedText("weekly limit", resetMessage, model);
  }
  if (limits.rateLimitType === "five_hour") {
    return formatLimitReachedText("session limit", resetMessage, model);
  }
  return formatLimitReachedText("usage limit", resetMessage, model);
}
function getEarlyWarningText(limits) {
  let limitName = null;
  switch (limits.rateLimitType) {
    case "seven_day":
      limitName = "weekly limit";
      break;
    case "five_hour":
      limitName = "session limit";
      break;
    case "seven_day_opus":
      limitName = "Opus limit";
      break;
    case "seven_day_sonnet":
      limitName = "Sonnet limit";
      break;
    case "overage":
      limitName = "extra usage";
      break;
    case void 0:
      return null;
  }
  const used = limits.utilization ? Math.floor(limits.utilization * 100) : void 0;
  const resetTime = limits.resetsAt ? formatResetTime(limits.resetsAt, true) : void 0;
  const upsell = getWarningUpsellText(limits.rateLimitType);
  if (used && resetTime) {
    const base2 = `You've used ${used}% of your ${limitName} \xB7 resets ${resetTime}`;
    return upsell ? `${base2} \xB7 ${upsell}` : base2;
  }
  if (used) {
    const base2 = `You've used ${used}% of your ${limitName}`;
    return upsell ? `${base2} \xB7 ${upsell}` : base2;
  }
  if (limits.rateLimitType === "overage") {
    limitName += " limit";
  }
  if (resetTime) {
    const base2 = `Approaching ${limitName} \xB7 resets ${resetTime}`;
    return upsell ? `${base2} \xB7 ${upsell}` : base2;
  }
  const base = `Approaching ${limitName}`;
  return upsell ? `${base} \xB7 ${upsell}` : base;
}
function getWarningUpsellText(rateLimitType) {
  const subscriptionType = getSubscriptionType();
  const hasExtraUsageEnabled = getOauthAccountInfo()?.hasExtraUsageEnabled === true;
  if (rateLimitType === "five_hour") {
    if (subscriptionType === "team" || subscriptionType === "enterprise") {
      if (!hasExtraUsageEnabled && isOverageProvisioningAllowed()) {
        return "/extra-usage to request more";
      }
      return null;
    }
    if (subscriptionType === "pro" || subscriptionType === "max") {
      return "/upgrade to keep using Claude Code";
    }
  }
  if (rateLimitType === "overage") {
    if (subscriptionType === "team" || subscriptionType === "enterprise") {
      if (!hasExtraUsageEnabled && isOverageProvisioningAllowed()) {
        return "/extra-usage to request more";
      }
    }
  }
  return null;
}
function getUsingOverageText(limits) {
  const resetTime = limits.resetsAt ? formatResetTime(limits.resetsAt, true) : "";
  let limitName = "";
  if (limits.rateLimitType === "five_hour") {
    limitName = "session limit";
  } else if (limits.rateLimitType === "seven_day") {
    limitName = "weekly limit";
  } else if (limits.rateLimitType === "seven_day_opus") {
    limitName = "Opus limit";
  } else if (limits.rateLimitType === "seven_day_sonnet") {
    const subscriptionType = getSubscriptionType();
    const isProOrEnterprise = subscriptionType === "pro" || subscriptionType === "enterprise";
    limitName = isProOrEnterprise ? "weekly limit" : "Sonnet limit";
  }
  if (!limitName) {
    return "Now using extra usage";
  }
  const resetMessage = resetTime ? ` \xB7 Your ${limitName} resets ${resetTime}` : "";
  return `You're now using extra usage${resetMessage}`;
}
function formatLimitReachedText(limit, resetMessage, _model) {
  if (process.env.USER_TYPE === "ant") {
    return `You've hit your ${limit}${resetMessage}. If you have feedback about this limit, post in ${FEEDBACK_CHANNEL_ANT}. You can reset your limits with /reset-limits`;
  }
  return `You've hit your ${limit}${resetMessage}`;
}
export {
  RATE_LIMIT_ERROR_PREFIXES,
  getRateLimitErrorMessage,
  getRateLimitMessage,
  getRateLimitWarning,
  getUsingOverageText,
  isRateLimitErrorMessage
};
