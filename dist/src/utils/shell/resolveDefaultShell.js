import { getInitialSettings } from "../settings/settings.js";
function resolveDefaultShell() {
  return getInitialSettings().defaultShell ?? "bash";
}
export {
  resolveDefaultShell
};
