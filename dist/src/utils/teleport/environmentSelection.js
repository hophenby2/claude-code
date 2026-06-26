import { SETTING_SOURCES } from "../settings/constants.js";
import {
  getSettings_DEPRECATED,
  getSettingsForSource
} from "../settings/settings.js";
import { fetchEnvironments } from "./environments.js";
async function getEnvironmentSelectionInfo() {
  const environments = await fetchEnvironments();
  if (environments.length === 0) {
    return {
      availableEnvironments: [],
      selectedEnvironment: null,
      selectedEnvironmentSource: null
    };
  }
  const mergedSettings = getSettings_DEPRECATED();
  const defaultEnvironmentId = mergedSettings?.remote?.defaultEnvironmentId;
  let selectedEnvironment = environments.find((env) => env.kind !== "bridge") ?? environments[0];
  let selectedEnvironmentSource = null;
  if (defaultEnvironmentId) {
    const matchingEnvironment = environments.find(
      (env) => env.environment_id === defaultEnvironmentId
    );
    if (matchingEnvironment) {
      selectedEnvironment = matchingEnvironment;
      for (let i = SETTING_SOURCES.length - 1; i >= 0; i--) {
        const source = SETTING_SOURCES[i];
        if (!source || source === "flagSettings") {
          continue;
        }
        const sourceSettings = getSettingsForSource(source);
        if (sourceSettings?.remote?.defaultEnvironmentId === defaultEnvironmentId) {
          selectedEnvironmentSource = source;
          break;
        }
      }
    }
  }
  return {
    availableEnvironments: environments,
    selectedEnvironment,
    selectedEnvironmentSource
  };
}
export {
  getEnvironmentSelectionInfo
};
