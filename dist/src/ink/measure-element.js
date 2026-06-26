const measureElement = (node) => ({
  width: node.yogaNode?.getComputedWidth() ?? 0,
  height: node.yogaNode?.getComputedHeight() ?? 0
});
var measure_element_default = measureElement;
export {
  measure_element_default as default
};
