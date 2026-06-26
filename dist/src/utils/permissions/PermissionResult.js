function getRuleBehaviorDescription(permissionResult) {
  switch (permissionResult) {
    case "allow":
      return "allowed";
    case "deny":
      return "denied";
    default:
      return "asked for confirmation for";
  }
}
export {
  getRuleBehaviorDescription
};
