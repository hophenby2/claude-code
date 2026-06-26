function isBridgePermissionResponse(value) {
  if (!value || typeof value !== "object") return false;
  return "behavior" in value && (value.behavior === "allow" || value.behavior === "deny");
}
export {
  isBridgePermissionResponse
};
