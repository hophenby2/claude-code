const cleanupFunctions = /* @__PURE__ */ new Set();
function registerCleanup(cleanupFn) {
  cleanupFunctions.add(cleanupFn);
  return () => cleanupFunctions.delete(cleanupFn);
}
async function runCleanupFunctions() {
  await Promise.all(Array.from(cleanupFunctions).map((fn) => fn()));
}
export {
  registerCleanup,
  runCleanupFunctions
};
