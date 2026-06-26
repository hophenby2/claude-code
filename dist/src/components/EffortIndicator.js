import {
  EFFORT_HIGH,
  EFFORT_LOW,
  EFFORT_MAX,
  EFFORT_MEDIUM
} from "../constants/figures.js";
import {
  getDisplayedEffortLevel,
  modelSupportsEffort
} from "../utils/effort.js";
function getEffortNotificationText(effortValue, model) {
  if (!modelSupportsEffort(model)) return void 0;
  const level = getDisplayedEffortLevel(model, effortValue);
  return `${effortLevelToSymbol(level)} ${level} \xB7 /effort`;
}
function effortLevelToSymbol(level) {
  switch (level) {
    case "low":
      return EFFORT_LOW;
    case "medium":
      return EFFORT_MEDIUM;
    case "high":
      return EFFORT_HIGH;
    case "max":
      return EFFORT_MAX;
    default:
      return EFFORT_HIGH;
  }
}
export {
  effortLevelToSymbol,
  getEffortNotificationText
};
