let cached;
function requireComputerUseSwift() {
  if (process.platform !== "darwin") {
    throw new Error("@ant/computer-use-swift is macOS-only");
  }
  return cached ??= require("@ant/computer-use-swift");
}
export {
  requireComputerUseSwift
};
