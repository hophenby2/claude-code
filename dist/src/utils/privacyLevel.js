function getPrivacyLevel() {
  if (process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC) {
    return "essential-traffic";
  }
  if (process.env.DISABLE_TELEMETRY) {
    return "no-telemetry";
  }
  return "default";
}
function isEssentialTrafficOnly() {
  return getPrivacyLevel() === "essential-traffic";
}
function isTelemetryDisabled() {
  return getPrivacyLevel() !== "default";
}
function getEssentialTrafficOnlyReason() {
  if (process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC) {
    return "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC";
  }
  return null;
}
export {
  getEssentialTrafficOnlyReason,
  getPrivacyLevel,
  isEssentialTrafficOnly,
  isTelemetryDisabled
};
