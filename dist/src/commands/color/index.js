const color = {
  type: "local-jsx",
  name: "color",
  description: "Set the prompt bar color for this session",
  immediate: true,
  argumentHint: "<color|default>",
  load: () => import("./color.js")
};
var color_default = color;
export {
  color_default as default
};
