const outputStyle = {
  type: "local-jsx",
  name: "output-style",
  description: "Deprecated: use /config to change output style",
  isHidden: true,
  load: () => import("./output-style.js")
};
var output_style_default = outputStyle;
export {
  output_style_default as default
};
