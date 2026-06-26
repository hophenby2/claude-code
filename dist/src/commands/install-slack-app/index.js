const installSlackApp = {
  type: "local",
  name: "install-slack-app",
  description: "Install the Claude Slack app",
  availability: ["claude-ai"],
  supportsNonInteractive: false,
  load: () => import("./install-slack-app.js")
};
var install_slack_app_default = installSlackApp;
export {
  install_slack_app_default as default
};
