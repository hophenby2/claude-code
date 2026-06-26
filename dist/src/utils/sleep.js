function sleep(ms, signal, opts) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      if (opts?.throwOnAbort || opts?.abortError) {
        void reject(opts.abortError?.() ?? new Error("aborted"));
      } else {
        void resolve();
      }
      return;
    }
    const timer = setTimeout(
      (signal2, onAbort2, resolve2) => {
        signal2?.removeEventListener("abort", onAbort2);
        void resolve2();
      },
      ms,
      signal,
      onAbort,
      resolve
    );
    function onAbort() {
      clearTimeout(timer);
      if (opts?.throwOnAbort || opts?.abortError) {
        void reject(opts.abortError?.() ?? new Error("aborted"));
      } else {
        void resolve();
      }
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    if (opts?.unref) {
      timer.unref();
    }
  });
}
function rejectWithTimeout(reject, message) {
  reject(new Error(message));
}
function withTimeout(promise, ms, message) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(rejectWithTimeout, ms, reject, message);
    if (typeof timer === "object") timer.unref?.();
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer !== void 0) clearTimeout(timer);
  });
}
export {
  sleep,
  withTimeout
};
