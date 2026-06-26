import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
let cached;
function requireComputerUseSwift() {
  if (process.platform !== "darwin") {
    throw new Error("@ant/computer-use-swift is macOS-only");
  }
  return cached ??= require2("@ant/computer-use-swift");
}
export {
  requireComputerUseSwift
};
