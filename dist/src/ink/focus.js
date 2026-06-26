import { FocusEvent } from "./events/focus-event.js";
const MAX_FOCUS_STACK = 32;
class FocusManager {
  activeElement = null;
  dispatchFocusEvent;
  enabled = true;
  focusStack = [];
  constructor(dispatchFocusEvent) {
    this.dispatchFocusEvent = dispatchFocusEvent;
  }
  focus(node) {
    if (node === this.activeElement) return;
    if (!this.enabled) return;
    const previous = this.activeElement;
    if (previous) {
      const idx = this.focusStack.indexOf(previous);
      if (idx !== -1) this.focusStack.splice(idx, 1);
      this.focusStack.push(previous);
      if (this.focusStack.length > MAX_FOCUS_STACK) this.focusStack.shift();
      this.dispatchFocusEvent(previous, new FocusEvent("blur", node));
    }
    this.activeElement = node;
    this.dispatchFocusEvent(node, new FocusEvent("focus", previous));
  }
  blur() {
    if (!this.activeElement) return;
    const previous = this.activeElement;
    this.activeElement = null;
    this.dispatchFocusEvent(previous, new FocusEvent("blur", null));
  }
  /**
   * Called by the reconciler when a node is removed from the tree.
   * Handles both the exact node and any focused descendant within
   * the removed subtree. Dispatches blur and restores focus from stack.
   */
  handleNodeRemoved(node, root) {
    this.focusStack = this.focusStack.filter(
      (n) => n !== node && isInTree(n, root)
    );
    if (!this.activeElement) return;
    if (this.activeElement !== node && isInTree(this.activeElement, root)) {
      return;
    }
    const removed = this.activeElement;
    this.activeElement = null;
    this.dispatchFocusEvent(removed, new FocusEvent("blur", null));
    while (this.focusStack.length > 0) {
      const candidate = this.focusStack.pop();
      if (isInTree(candidate, root)) {
        this.activeElement = candidate;
        this.dispatchFocusEvent(candidate, new FocusEvent("focus", removed));
        return;
      }
    }
  }
  handleAutoFocus(node) {
    this.focus(node);
  }
  handleClickFocus(node) {
    const tabIndex = node.attributes["tabIndex"];
    if (typeof tabIndex !== "number") return;
    this.focus(node);
  }
  enable() {
    this.enabled = true;
  }
  disable() {
    this.enabled = false;
  }
  focusNext(root) {
    this.moveFocus(1, root);
  }
  focusPrevious(root) {
    this.moveFocus(-1, root);
  }
  moveFocus(direction, root) {
    if (!this.enabled) return;
    const tabbable = collectTabbable(root);
    if (tabbable.length === 0) return;
    const currentIndex = this.activeElement ? tabbable.indexOf(this.activeElement) : -1;
    const nextIndex = currentIndex === -1 ? direction === 1 ? 0 : tabbable.length - 1 : (currentIndex + direction + tabbable.length) % tabbable.length;
    const next = tabbable[nextIndex];
    if (next) {
      this.focus(next);
    }
  }
}
function collectTabbable(root) {
  const result = [];
  walkTree(root, result);
  return result;
}
function walkTree(node, result) {
  const tabIndex = node.attributes["tabIndex"];
  if (typeof tabIndex === "number" && tabIndex >= 0) {
    result.push(node);
  }
  for (const child of node.childNodes) {
    if (child.nodeName !== "#text") {
      walkTree(child, result);
    }
  }
}
function isInTree(node, root) {
  let current = node;
  while (current) {
    if (current === root) return true;
    current = current.parentNode;
  }
  return false;
}
function getRootNode(node) {
  let current = node;
  while (current) {
    if (current.focusManager) return current;
    current = current.parentNode;
  }
  throw new Error("Node is not in a tree with a FocusManager");
}
function getFocusManager(node) {
  return getRootNode(node).focusManager;
}
export {
  FocusManager,
  getFocusManager,
  getRootNode
};
