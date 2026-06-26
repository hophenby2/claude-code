function isRunningWithBun() {
  return process.versions.bun !== void 0;
}
function isInBundledMode() {
  return typeof Bun !== "undefined" && Array.isArray(Bun.embeddedFiles) && Bun.embeddedFiles.length > 0;
}
export {
  isInBundledMode,
  isRunningWithBun
};
