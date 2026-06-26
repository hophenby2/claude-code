import { useAppState } from "../state/AppState.js";
function useSettings() {
  return useAppState((s) => s.settings);
}
export {
  useSettings
};
