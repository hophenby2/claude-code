import { logEvent } from "../../services/analytics/index.js";
import { openBrowser } from "../../utils/browser.js";
import { saveGlobalConfig } from "../../utils/config.js";
const SLACK_APP_URL = "https://slack.com/marketplace/A08SF47R6P4-claude";
async function call() {
  logEvent("tengu_install_slack_app_clicked", {});
  saveGlobalConfig((current) => ({
    ...current,
    slackAppInstallCount: (current.slackAppInstallCount ?? 0) + 1
  }));
  const success = await openBrowser(SLACK_APP_URL);
  if (success) {
    return {
      type: "text",
      value: "Opening Slack app installation page in browser\u2026"
    };
  } else {
    return {
      type: "text",
      value: `Couldn't open browser. Visit: ${SLACK_APP_URL}`
    };
  }
}
export {
  call
};
