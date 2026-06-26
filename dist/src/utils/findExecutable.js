import { whichSync } from "./which.js";
function findExecutable(exe, args) {
  const resolved = whichSync(exe);
  return { cmd: resolved ?? exe, args };
}
export {
  findExecutable
};
