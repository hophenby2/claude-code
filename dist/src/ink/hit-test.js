import { ClickEvent } from "./events/click-event.js";
import { nodeCache } from "./node-cache.js";
function hitTest(node, col, row) {
  const rect = nodeCache.get(node);
  if (!rect) return null;
  if (col < rect.x || col >= rect.x + rect.width || row < rect.y || row >= rect.y + rect.height) {
    return null;
  }
  for (let i = node.childNodes.length - 1; i >= 0; i--) {
    const child = node.childNodes[i];
    if (child.nodeName === "#text") continue;
    const hit = hitTest(child, col, row);
    if (hit) return hit;
  }
  return node;
}
function dispatchClick(root, col, row, cellIsBlank = false) {
  let target = hitTest(root, col, row) ?? void 0;
  if (!target) return false;
  if (root.focusManager) {
    let focusTarget = target;
    while (focusTarget) {
      if (typeof focusTarget.attributes["tabIndex"] === "number") {
        root.focusManager.handleClickFocus(focusTarget);
        break;
      }
      focusTarget = focusTarget.parentNode;
    }
  }
  const event = new ClickEvent(col, row, cellIsBlank);
  let handled = false;
  while (target) {
    const handler = target._eventHandlers?.onClick;
    if (handler) {
      handled = true;
      const rect = nodeCache.get(target);
      if (rect) {
        event.localCol = col - rect.x;
        event.localRow = row - rect.y;
      }
      handler(event);
      if (event.didStopImmediatePropagation()) return true;
    }
    target = target.parentNode;
  }
  return handled;
}
function dispatchHover(root, col, row, hovered) {
  const next = /* @__PURE__ */ new Set();
  let node = hitTest(root, col, row) ?? void 0;
  while (node) {
    const h = node._eventHandlers;
    if (h?.onMouseEnter || h?.onMouseLeave) next.add(node);
    node = node.parentNode;
  }
  for (const old of hovered) {
    if (!next.has(old)) {
      hovered.delete(old);
      if (old.parentNode) {
        ;
        old._eventHandlers?.onMouseLeave?.();
      }
    }
  }
  for (const n of next) {
    if (!hovered.has(n)) {
      hovered.add(n);
      n._eventHandlers?.onMouseEnter?.();
    }
  }
}
export {
  dispatchClick,
  dispatchHover,
  hitTest
};
