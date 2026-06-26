import { getMcpConfigsByScope } from "../../services/mcp/config.js";
import { getSettingsWithErrors } from "./settings.js";
function getSettingsWithAllErrors() {
  const result = getSettingsWithErrors();
  const scopes = ["user", "project", "local"];
  const mcpErrors = scopes.flatMap((scope) => getMcpConfigsByScope(scope).errors);
  return {
    settings: result.settings,
    errors: [...result.errors, ...mcpErrors]
  };
}
export {
  getSettingsWithAllErrors
};
