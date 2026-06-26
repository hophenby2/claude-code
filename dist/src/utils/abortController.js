import { setMaxListeners } from "events";
const DEFAULT_MAX_LISTENERS = 50;
function createAbortController(maxListeners = DEFAULT_MAX_LISTENERS) {
  const controller = new AbortController();
  setMaxListeners(maxListeners, controller.signal);
  return controller;
}
function propagateAbort(weakChild) {
  const parent = this.deref();
  weakChild.deref()?.abort(parent?.signal.reason);
}
function removeAbortHandler(weakHandler) {
  const parent = this.deref();
  const handler = weakHandler.deref();
  if (parent && handler) {
    parent.signal.removeEventListener("abort", handler);
  }
}
function createChildAbortController(parent, maxListeners) {
  const child = createAbortController(maxListeners);
  if (parent.signal.aborted) {
    child.abort(parent.signal.reason);
    return child;
  }
  const weakChild = new WeakRef(child);
  const weakParent = new WeakRef(parent);
  const handler = propagateAbort.bind(weakParent, weakChild);
  parent.signal.addEventListener("abort", handler, { once: true });
  child.signal.addEventListener(
    "abort",
    removeAbortHandler.bind(weakParent, new WeakRef(handler)),
    { once: true }
  );
  return child;
}
export {
  createAbortController,
  createChildAbortController
};
