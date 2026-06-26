import { jsx } from "react/jsx-runtime";
import { PluginSettings } from "./PluginSettings.js";
async function call(onDone, _context, args) {
  return /* @__PURE__ */ jsx(PluginSettings, { onComplete: onDone, args });
}
export {
  call
};
