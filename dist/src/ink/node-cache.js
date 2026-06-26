const nodeCache = /* @__PURE__ */ new WeakMap();
const pendingClears = /* @__PURE__ */ new WeakMap();
let absoluteNodeRemoved = false;
function addPendingClear(parent, rect, isAbsolute) {
  const existing = pendingClears.get(parent);
  if (existing) {
    existing.push(rect);
  } else {
    pendingClears.set(parent, [rect]);
  }
  if (isAbsolute) {
    absoluteNodeRemoved = true;
  }
}
function consumeAbsoluteRemovedFlag() {
  const had = absoluteNodeRemoved;
  absoluteNodeRemoved = false;
  return had;
}
export {
  addPendingClear,
  consumeAbsoluteRemovedFlag,
  nodeCache,
  pendingClears
};
