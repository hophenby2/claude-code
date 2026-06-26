import { getTeamName } from "./teammate.js";
function getStandaloneAgentName(appState) {
  if (getTeamName()) {
    return void 0;
  }
  return appState.standaloneAgentContext?.name;
}
export {
  getStandaloneAgentName
};
