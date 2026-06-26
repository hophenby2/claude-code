function removeSandboxViolationTags(text) {
  return text.replace(/<sandbox_violations>[\s\S]*?<\/sandbox_violations>/g, "");
}
export {
  removeSandboxViolationTags
};
