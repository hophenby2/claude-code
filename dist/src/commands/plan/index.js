const plan = {
  type: "local-jsx",
  name: "plan",
  description: "Enable plan mode or view the current session plan",
  argumentHint: "[open|<description>]",
  load: () => import("./plan.js")
};
var plan_default = plan;
export {
  plan_default as default
};
