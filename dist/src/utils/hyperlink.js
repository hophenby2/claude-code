import chalk from "chalk";
import { supportsHyperlinks } from "../ink/supports-hyperlinks.js";
const OSC8_START = "\x1B]8;;";
const OSC8_END = "\x07";
function createHyperlink(url, content, options) {
  const hasSupport = options?.supportsHyperlinks ?? supportsHyperlinks();
  if (!hasSupport) {
    return url;
  }
  const displayText = content ?? url;
  const coloredText = chalk.blue(displayText);
  return `${OSC8_START}${url}${OSC8_END}${coloredText}${OSC8_START}${OSC8_END}`;
}
export {
  OSC8_END,
  OSC8_START,
  createHyperlink
};
