import figures from "figures";
import { color } from "../components/design-system/color.js";
const DEFAULT_TREE_CHARS = {
  branch: figures.lineUpDownRight,
  // '├'
  lastBranch: figures.lineUpRight,
  // '└'
  line: figures.lineVertical,
  // '│'
  empty: " "
};
function treeify(obj, options = {}) {
  const {
    showValues = true,
    hideFunctions = false,
    themeName = "dark",
    treeCharColors = {}
  } = options;
  const lines = [];
  const visited = /* @__PURE__ */ new WeakSet();
  function colorize(text, colorKey) {
    if (!colorKey) return text;
    return color(colorKey, themeName)(text);
  }
  function growBranch(node, prefix, _isLast, depth = 0) {
    if (typeof node === "string") {
      lines.push(prefix + colorize(node, treeCharColors.value));
      return;
    }
    if (typeof node !== "object" || node === null) {
      if (showValues) {
        const valueStr = String(node);
        lines.push(prefix + colorize(valueStr, treeCharColors.value));
      }
      return;
    }
    if (visited.has(node)) {
      lines.push(prefix + colorize("[Circular]", treeCharColors.value));
      return;
    }
    visited.add(node);
    const keys2 = Object.keys(node).filter((key) => {
      const value = node[key];
      if (hideFunctions && typeof value === "function") return false;
      return true;
    });
    keys2.forEach((key, index) => {
      const value = node[key];
      const isLastKey = index === keys2.length - 1;
      const nodePrefix = depth === 0 && index === 0 ? "" : prefix;
      const treeChar = isLastKey ? DEFAULT_TREE_CHARS.lastBranch : DEFAULT_TREE_CHARS.branch;
      const coloredTreeChar = colorize(treeChar, treeCharColors.treeChar);
      const coloredKey = key.trim() === "" ? "" : colorize(key, treeCharColors.key);
      let line = nodePrefix + coloredTreeChar + (coloredKey ? " " + coloredKey : "");
      const shouldAddColon = key.trim() !== "";
      if (value && typeof value === "object" && visited.has(value)) {
        const coloredValue = colorize("[Circular]", treeCharColors.value);
        lines.push(
          line + (shouldAddColon ? ": " : line ? " " : "") + coloredValue
        );
      } else if (value && typeof value === "object" && !Array.isArray(value)) {
        lines.push(line);
        const continuationChar = isLastKey ? DEFAULT_TREE_CHARS.empty : DEFAULT_TREE_CHARS.line;
        const coloredContinuation = colorize(
          continuationChar,
          treeCharColors.treeChar
        );
        const nextPrefix = nodePrefix + coloredContinuation + " ";
        growBranch(value, nextPrefix, isLastKey, depth + 1);
      } else if (Array.isArray(value)) {
        lines.push(
          line + (shouldAddColon ? ": " : line ? " " : "") + "[Array(" + value.length + ")]"
        );
      } else if (showValues) {
        const valueStr = typeof value === "function" ? "[Function]" : String(value);
        const coloredValue = colorize(valueStr, treeCharColors.value);
        line += (shouldAddColon ? ": " : line ? " " : "") + coloredValue;
        lines.push(line);
      } else {
        lines.push(line);
      }
    });
  }
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    return colorize("(empty)", treeCharColors.value);
  }
  if (keys.length === 1 && keys[0] !== void 0 && keys[0].trim() === "" && typeof obj[keys[0]] === "string") {
    const firstKey = keys[0];
    const coloredTreeChar = colorize(
      DEFAULT_TREE_CHARS.lastBranch,
      treeCharColors.treeChar
    );
    const coloredValue = colorize(obj[firstKey], treeCharColors.value);
    return coloredTreeChar + " " + coloredValue;
  }
  growBranch(obj, "", true);
  return lines.join("\n");
}
export {
  treeify
};
