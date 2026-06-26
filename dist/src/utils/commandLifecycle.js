let listener = null;
function setCommandLifecycleListener(cb) {
  listener = cb;
}
function notifyCommandLifecycle(uuid, state) {
  listener?.(uuid, state);
}
export {
  notifyCommandLifecycle,
  setCommandLifecycleListener
};
