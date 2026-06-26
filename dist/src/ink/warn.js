import { logForDebugging } from "../utils/debug.js";
function ifNotInteger(value, name) {
  if (value === void 0) return;
  if (Number.isInteger(value)) return;
  logForDebugging(`${name} should be an integer, got ${value}`, {
    level: "warn"
  });
}
export {
  ifNotInteger
};
