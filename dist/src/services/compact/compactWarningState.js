import { createStore } from "../../state/store.js";
const compactWarningStore = createStore(false);
function suppressCompactWarning() {
  compactWarningStore.setState(() => true);
}
function clearCompactWarningSuppression() {
  compactWarningStore.setState(() => false);
}
export {
  clearCompactWarningSuppression,
  compactWarningStore,
  suppressCompactWarning
};
