const feature = (_name) => false;
import { createSignal } from "./signal.js";
const CLASSIFIER_APPROVALS = /* @__PURE__ */ new Map();
const CLASSIFIER_CHECKING = /* @__PURE__ */ new Set();
const classifierChecking = createSignal();
function setClassifierApproval(toolUseID, matchedRule) {
  if (true) {
    return;
  }
  CLASSIFIER_APPROVALS.set(toolUseID, {
    classifier: "bash",
    matchedRule
  });
}
function getClassifierApproval(toolUseID) {
  if (true) {
    return void 0;
  }
  const approval = CLASSIFIER_APPROVALS.get(toolUseID);
  if (!approval || approval.classifier !== "bash") return void 0;
  return approval.matchedRule;
}
function setYoloClassifierApproval(toolUseID, reason) {
  if (true) {
    return;
  }
  CLASSIFIER_APPROVALS.set(toolUseID, { classifier: "auto-mode", reason });
}
function getYoloClassifierApproval(toolUseID) {
  if (true) {
    return void 0;
  }
  const approval = CLASSIFIER_APPROVALS.get(toolUseID);
  if (!approval || approval.classifier !== "auto-mode") return void 0;
  return approval.reason;
}
function setClassifierChecking(toolUseID) {
  if (true) return;
  CLASSIFIER_CHECKING.add(toolUseID);
  classifierChecking.emit();
}
function clearClassifierChecking(toolUseID) {
  if (true) return;
  CLASSIFIER_CHECKING.delete(toolUseID);
  classifierChecking.emit();
}
const subscribeClassifierChecking = classifierChecking.subscribe;
function isClassifierChecking(toolUseID) {
  return CLASSIFIER_CHECKING.has(toolUseID);
}
function deleteClassifierApproval(toolUseID) {
  CLASSIFIER_APPROVALS.delete(toolUseID);
}
function clearClassifierApprovals() {
  CLASSIFIER_APPROVALS.clear();
  CLASSIFIER_CHECKING.clear();
  classifierChecking.emit();
}
export {
  clearClassifierApprovals,
  clearClassifierChecking,
  deleteClassifierApproval,
  getClassifierApproval,
  getYoloClassifierApproval,
  isClassifierChecking,
  setClassifierApproval,
  setClassifierChecking,
  setYoloClassifierApproval,
  subscribeClassifierChecking
};
