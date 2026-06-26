import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
let cached;
function requireComputerUseInput() {
  if (cached) return cached;
  const input = require2("@ant/computer-use-input");
  if (!input.isSupported) {
    throw new Error("@ant/computer-use-input is not supported on this platform");
  }
  return cached = input;
}
export {
  requireComputerUseInput
};
