function squashTextNodesToSegments(node, inheritedStyles = {}, inheritedHyperlink, out = []) {
  const mergedStyles = node.textStyles ? { ...inheritedStyles, ...node.textStyles } : inheritedStyles;
  for (const childNode of node.childNodes) {
    if (childNode === void 0) {
      continue;
    }
    if (childNode.nodeName === "#text") {
      if (childNode.nodeValue.length > 0) {
        out.push({
          text: childNode.nodeValue,
          styles: mergedStyles,
          hyperlink: inheritedHyperlink
        });
      }
    } else if (childNode.nodeName === "ink-text" || childNode.nodeName === "ink-virtual-text") {
      squashTextNodesToSegments(
        childNode,
        mergedStyles,
        inheritedHyperlink,
        out
      );
    } else if (childNode.nodeName === "ink-link") {
      const href = childNode.attributes["href"];
      squashTextNodesToSegments(
        childNode,
        mergedStyles,
        href || inheritedHyperlink,
        out
      );
    }
  }
  return out;
}
function squashTextNodes(node) {
  let text = "";
  for (const childNode of node.childNodes) {
    if (childNode === void 0) {
      continue;
    }
    if (childNode.nodeName === "#text") {
      text += childNode.nodeValue;
    } else if (childNode.nodeName === "ink-text" || childNode.nodeName === "ink-virtual-text") {
      text += squashTextNodes(childNode);
    } else if (childNode.nodeName === "ink-link") {
      text += squashTextNodes(childNode);
    }
  }
  return text;
}
var squash_text_nodes_default = squashTextNodes;
export {
  squash_text_nodes_default as default,
  squashTextNodesToSegments
};
