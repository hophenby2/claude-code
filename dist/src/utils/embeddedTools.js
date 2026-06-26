import { isEnvTruthy } from "./envUtils.js";
function hasEmbeddedSearchTools() {
  if (!isEnvTruthy(process.env.EMBEDDED_SEARCH_TOOLS)) return false;
  const e = process.env.CLAUDE_CODE_ENTRYPOINT;
  return e !== "sdk-ts" && e !== "sdk-py" && e !== "sdk-cli" && e !== "local-agent";
}
function embeddedSearchToolsBinaryPath() {
  return process.execPath;
}
export {
  embeddedSearchToolsBinaryPath,
  hasEmbeddedSearchTools
};
