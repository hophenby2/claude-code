import capitalize from "lodash-es/capitalize.js";
import { getSettingSourceName } from "../../utils/settings/constants.js";
function getAgentSourceDisplayName(source) {
  if (source === "all") {
    return "Agents";
  }
  if (source === "built-in") {
    return "Built-in agents";
  }
  if (source === "plugin") {
    return "Plugin agents";
  }
  return capitalize(getSettingSourceName(source));
}
export {
  getAgentSourceDisplayName
};
