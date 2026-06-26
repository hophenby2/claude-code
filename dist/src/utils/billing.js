import {
  getAnthropicApiKey,
  getAuthTokenSource,
  getSubscriptionType,
  isClaudeAISubscriber
} from "./auth.js";
import { getGlobalConfig } from "./config.js";
import { isEnvTruthy } from "./envUtils.js";
function hasConsoleBillingAccess() {
  if (isEnvTruthy(process.env.DISABLE_COST_WARNINGS)) {
    return false;
  }
  const isSubscriber = isClaudeAISubscriber();
  if (isSubscriber) return false;
  const authSource = getAuthTokenSource();
  const hasApiKey = getAnthropicApiKey() !== null;
  if (!authSource.hasToken && !hasApiKey) {
    return false;
  }
  const config = getGlobalConfig();
  const orgRole = config.oauthAccount?.organizationRole;
  const workspaceRole = config.oauthAccount?.workspaceRole;
  if (!orgRole || !workspaceRole) {
    return false;
  }
  return ["admin", "billing"].includes(orgRole) || ["workspace_admin", "workspace_billing"].includes(workspaceRole);
}
let mockBillingAccessOverride = null;
function setMockBillingAccessOverride(value) {
  mockBillingAccessOverride = value;
}
function hasClaudeAiBillingAccess() {
  if (mockBillingAccessOverride !== null) {
    return mockBillingAccessOverride;
  }
  if (!isClaudeAISubscriber()) {
    return false;
  }
  const subscriptionType = getSubscriptionType();
  if (subscriptionType === "max" || subscriptionType === "pro") {
    return true;
  }
  const config = getGlobalConfig();
  const orgRole = config.oauthAccount?.organizationRole;
  return !!orgRole && ["admin", "billing", "owner", "primary_owner"].includes(orgRole);
}
export {
  hasClaudeAiBillingAccess,
  hasConsoleBillingAccess,
  setMockBillingAccessOverride
};
