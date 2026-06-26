let cached;
function requireComputerUseInput() {
  if (cached) return cached;
  const input = require("@ant/computer-use-input");
  if (!input.isSupported) {
    throw new Error("@ant/computer-use-input is not supported on this platform");
  }
  return cached = input;
}
export {
  requireComputerUseInput
};
