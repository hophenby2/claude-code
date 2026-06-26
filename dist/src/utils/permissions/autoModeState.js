import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
let autoModeActive = false;
let autoModeFlagCli = false;
let autoModeCircuitBroken = false;
function setAutoModeActive(active) {
  autoModeActive = active;
}
function isAutoModeActive() {
  return autoModeActive;
}
function setAutoModeFlagCli(passed) {
  autoModeFlagCli = passed;
}
function getAutoModeFlagCli() {
  return autoModeFlagCli;
}
function setAutoModeCircuitBroken(broken) {
  autoModeCircuitBroken = broken;
}
function isAutoModeCircuitBroken() {
  return autoModeCircuitBroken;
}
function _resetForTesting() {
  autoModeActive = false;
  autoModeFlagCli = false;
  autoModeCircuitBroken = false;
}
export {
  _resetForTesting,
  getAutoModeFlagCli,
  isAutoModeActive,
  isAutoModeCircuitBroken,
  setAutoModeActive,
  setAutoModeCircuitBroken,
  setAutoModeFlagCli
};
