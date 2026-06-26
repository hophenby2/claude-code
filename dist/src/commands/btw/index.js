const btw = {
  type: "local-jsx",
  name: "btw",
  description: "Ask a quick side question without interrupting the main conversation",
  immediate: true,
  argumentHint: "<question>",
  load: () => import("./btw.js")
};
var btw_default = btw;
export {
  btw_default as default
};
