import { LayoutEdge } from "./layout/node.js";
const getMaxWidth = (yogaNode) => {
  return yogaNode.getComputedWidth() - yogaNode.getComputedPadding(LayoutEdge.Left) - yogaNode.getComputedPadding(LayoutEdge.Right) - yogaNode.getComputedBorder(LayoutEdge.Left) - yogaNode.getComputedBorder(LayoutEdge.Right);
};
var get_max_width_default = getMaxWidth;
export {
  get_max_width_default as default
};
