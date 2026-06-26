var usage_default = {
  type: "local-jsx",
  name: "usage",
  description: "Show plan usage limits",
  availability: ["claude-ai"],
  load: () => import("./usage.js")
};
export {
  usage_default as default
};
