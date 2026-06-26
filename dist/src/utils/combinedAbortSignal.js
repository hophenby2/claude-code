import { createAbortController } from "./abortController.js";
function createCombinedAbortSignal(signal, opts) {
  const { signalB, timeoutMs } = opts ?? {};
  const combined = createAbortController();
  if (signal?.aborted || signalB?.aborted) {
    combined.abort();
    return { signal: combined.signal, cleanup: () => {
    } };
  }
  let timer;
  const abortCombined = () => {
    if (timer !== void 0) clearTimeout(timer);
    combined.abort();
  };
  if (timeoutMs !== void 0) {
    timer = setTimeout(abortCombined, timeoutMs);
    timer.unref?.();
  }
  signal?.addEventListener("abort", abortCombined);
  signalB?.addEventListener("abort", abortCombined);
  const cleanup = () => {
    if (timer !== void 0) clearTimeout(timer);
    signal?.removeEventListener("abort", abortCombined);
    signalB?.removeEventListener("abort", abortCombined);
  };
  return { signal: combined.signal, cleanup };
}
export {
  createCombinedAbortSignal
};
