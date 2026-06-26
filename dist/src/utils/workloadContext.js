import { AsyncLocalStorage } from "async_hooks";
const WORKLOAD_CRON = "cron";
const workloadStorage = new AsyncLocalStorage();
function getWorkload() {
  return workloadStorage.getStore()?.workload;
}
function runWithWorkload(workload, fn) {
  return workloadStorage.run({ workload }, fn);
}
export {
  WORKLOAD_CRON,
  getWorkload,
  runWithWorkload
};
