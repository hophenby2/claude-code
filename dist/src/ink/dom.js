import { createLayoutNode } from "./layout/engine.js";
import { LayoutDisplay, LayoutMeasureMode } from "./layout/node.js";
import measureText from "./measure-text.js";
import { addPendingClear, nodeCache } from "./node-cache.js";
import squashTextNodes from "./squash-text-nodes.js";
import { expandTabs } from "./tabstops.js";
import wrapText from "./wrap-text.js";
const createNode = (nodeName) => {
  const needsYogaNode = nodeName !== "ink-virtual-text" && nodeName !== "ink-link" && nodeName !== "ink-progress";
  const node = {
    nodeName,
    style: {},
    attributes: {},
    childNodes: [],
    parentNode: void 0,
    yogaNode: needsYogaNode ? createLayoutNode() : void 0,
    dirty: false
  };
  if (nodeName === "ink-text") {
    node.yogaNode?.setMeasureFunc(measureTextNode.bind(null, node));
  } else if (nodeName === "ink-raw-ansi") {
    node.yogaNode?.setMeasureFunc(measureRawAnsiNode.bind(null, node));
  }
  return node;
};
const appendChildNode = (node, childNode) => {
  if (childNode.parentNode) {
    removeChildNode(childNode.parentNode, childNode);
  }
  childNode.parentNode = node;
  node.childNodes.push(childNode);
  if (childNode.yogaNode) {
    node.yogaNode?.insertChild(
      childNode.yogaNode,
      node.yogaNode.getChildCount()
    );
  }
  markDirty(node);
};
const insertBeforeNode = (node, newChildNode, beforeChildNode) => {
  if (newChildNode.parentNode) {
    removeChildNode(newChildNode.parentNode, newChildNode);
  }
  newChildNode.parentNode = node;
  const index = node.childNodes.indexOf(beforeChildNode);
  if (index >= 0) {
    let yogaIndex = 0;
    if (newChildNode.yogaNode && node.yogaNode) {
      for (let i = 0; i < index; i++) {
        if (node.childNodes[i]?.yogaNode) {
          yogaIndex++;
        }
      }
    }
    node.childNodes.splice(index, 0, newChildNode);
    if (newChildNode.yogaNode && node.yogaNode) {
      node.yogaNode.insertChild(newChildNode.yogaNode, yogaIndex);
    }
    markDirty(node);
    return;
  }
  node.childNodes.push(newChildNode);
  if (newChildNode.yogaNode) {
    node.yogaNode?.insertChild(
      newChildNode.yogaNode,
      node.yogaNode.getChildCount()
    );
  }
  markDirty(node);
};
const removeChildNode = (node, removeNode) => {
  if (removeNode.yogaNode) {
    removeNode.parentNode?.yogaNode?.removeChild(removeNode.yogaNode);
  }
  collectRemovedRects(node, removeNode);
  removeNode.parentNode = void 0;
  const index = node.childNodes.indexOf(removeNode);
  if (index >= 0) {
    node.childNodes.splice(index, 1);
  }
  markDirty(node);
};
function collectRemovedRects(parent, removed, underAbsolute = false) {
  if (removed.nodeName === "#text") return;
  const elem = removed;
  const isAbsolute = underAbsolute || elem.style.position === "absolute";
  const cached = nodeCache.get(elem);
  if (cached) {
    addPendingClear(parent, cached, isAbsolute);
    nodeCache.delete(elem);
  }
  for (const child of elem.childNodes) {
    collectRemovedRects(parent, child, isAbsolute);
  }
}
const setAttribute = (node, key, value) => {
  if (key === "children") {
    return;
  }
  if (node.attributes[key] === value) {
    return;
  }
  node.attributes[key] = value;
  markDirty(node);
};
const setStyle = (node, style) => {
  if (stylesEqual(node.style, style)) {
    return;
  }
  node.style = style;
  markDirty(node);
};
const setTextStyles = (node, textStyles) => {
  if (shallowEqual(node.textStyles, textStyles)) {
    return;
  }
  node.textStyles = textStyles;
  markDirty(node);
};
function stylesEqual(a, b) {
  return shallowEqual(a, b);
}
function shallowEqual(a, b) {
  if (a === b) return true;
  if (a === void 0 || b === void 0) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}
const createTextNode = (text) => {
  const node = {
    nodeName: "#text",
    nodeValue: text,
    yogaNode: void 0,
    parentNode: void 0,
    style: {}
  };
  setTextNodeValue(node, text);
  return node;
};
const measureTextNode = function(node, width, widthMode) {
  const rawText = node.nodeName === "#text" ? node.nodeValue : squashTextNodes(node);
  const text = expandTabs(rawText);
  const dimensions = measureText(text, width);
  if (dimensions.width <= width) {
    return dimensions;
  }
  if (dimensions.width >= 1 && width > 0 && width < 1) {
    return dimensions;
  }
  if (text.includes("\n") && widthMode === LayoutMeasureMode.Undefined) {
    const effectiveWidth = Math.max(width, dimensions.width);
    return measureText(text, effectiveWidth);
  }
  const textWrap = node.style?.textWrap ?? "wrap";
  const wrappedText = wrapText(text, width, textWrap);
  return measureText(wrappedText, width);
};
const measureRawAnsiNode = function(node) {
  return {
    width: node.attributes["rawWidth"],
    height: node.attributes["rawHeight"]
  };
};
const markDirty = (node) => {
  let current = node;
  let markedYoga = false;
  while (current) {
    if (current.nodeName !== "#text") {
      ;
      current.dirty = true;
      if (!markedYoga && (current.nodeName === "ink-text" || current.nodeName === "ink-raw-ansi") && current.yogaNode) {
        current.yogaNode.markDirty();
        markedYoga = true;
      }
    }
    current = current.parentNode;
  }
};
const scheduleRenderFrom = (node) => {
  let cur = node;
  while (cur?.parentNode) cur = cur.parentNode;
  if (cur && cur.nodeName !== "#text") cur.onRender?.();
};
const setTextNodeValue = (node, text) => {
  if (typeof text !== "string") {
    text = String(text);
  }
  if (node.nodeValue === text) {
    return;
  }
  node.nodeValue = text;
  markDirty(node);
};
function isDOMElement(node) {
  return node.nodeName !== "#text";
}
const clearYogaNodeReferences = (node) => {
  if ("childNodes" in node) {
    for (const child of node.childNodes) {
      clearYogaNodeReferences(child);
    }
  }
  node.yogaNode = void 0;
};
function findOwnerChainAtRow(root, y) {
  let best = [];
  walk(root, 0);
  return best;
  function walk(node, offsetY) {
    const yoga = node.yogaNode;
    if (!yoga || yoga.getDisplay() === LayoutDisplay.None) return;
    const top = offsetY + yoga.getComputedTop();
    const height = yoga.getComputedHeight();
    if (y < top || y >= top + height) return;
    if (node.debugOwnerChain) best = node.debugOwnerChain;
    for (const child of node.childNodes) {
      if (isDOMElement(child)) walk(child, top);
    }
  }
}
export {
  appendChildNode,
  clearYogaNodeReferences,
  createNode,
  createTextNode,
  findOwnerChainAtRow,
  insertBeforeNode,
  markDirty,
  removeChildNode,
  scheduleRenderFrom,
  setAttribute,
  setStyle,
  setTextNodeValue,
  setTextStyles
};
