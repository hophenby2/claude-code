const config = {
  aliases: ["settings"],
  type: "local-jsx",
  name: "config",
  description: "Open config panel",
  load: () => import("./config.js")
};
var config_default = config;
export {
  config_default as default
};
