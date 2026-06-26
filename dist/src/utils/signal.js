function createSignal() {
  const listeners = /* @__PURE__ */ new Set();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(...args) {
      for (const listener of listeners) listener(...args);
    },
    clear() {
      listeners.clear();
    }
  };
}
export {
  createSignal
};
