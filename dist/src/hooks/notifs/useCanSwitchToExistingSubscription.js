import { jsxs } from "react/jsx-runtime";
import { getOauthProfileFromApiKey } from "../../services/oauth/getOauthProfile.js";
import { isClaudeAISubscriber } from "../../utils/auth.js";
import { Text } from "../../ink.js";
import { logEvent } from "../../services/analytics/index.js";
import { getGlobalConfig, saveGlobalConfig } from "../../utils/config.js";
import { useStartupNotification } from "./useStartupNotification.js";
const MAX_SHOW_COUNT = 3;
function useCanSwitchToExistingSubscription() {
  useStartupNotification(_temp2);
}
async function _temp2() {
  if ((getGlobalConfig().subscriptionNoticeCount ?? 0) >= MAX_SHOW_COUNT) {
    return null;
  }
  const subscriptionType = await getExistingClaudeSubscription();
  if (subscriptionType === null) {
    return null;
  }
  saveGlobalConfig(_temp);
  logEvent("tengu_switch_to_subscription_notice_shown", {});
  return {
    key: "switch-to-subscription",
    jsx: /* @__PURE__ */ jsxs(Text, { color: "suggestion", children: [
      "Use your existing Claude ",
      subscriptionType,
      " plan with Claude Code",
      /* @__PURE__ */ jsxs(Text, { color: "text", dimColor: true, children: [
        " ",
        "\xB7 /login to activate"
      ] })
    ] }),
    priority: "low"
  };
}
function _temp(current) {
  return {
    ...current,
    subscriptionNoticeCount: (current.subscriptionNoticeCount ?? 0) + 1
  };
}
async function getExistingClaudeSubscription() {
  if (isClaudeAISubscriber()) {
    return null;
  }
  const profile = await getOauthProfileFromApiKey();
  if (!profile) {
    return null;
  }
  if (profile.account.has_claude_max) {
    return "Max";
  }
  if (profile.account.has_claude_pro) {
    return "Pro";
  }
  return null;
}
export {
  useCanSwitchToExistingSubscription
};
