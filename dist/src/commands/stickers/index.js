const stickers = {
  type: "local",
  name: "stickers",
  description: "Order Claude Code stickers",
  supportsNonInteractive: false,
  load: () => import("./stickers.js")
};
var stickers_default = stickers;
export {
  stickers_default as default
};
