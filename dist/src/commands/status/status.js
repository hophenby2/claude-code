import { jsx } from "react/jsx-runtime";
import { Settings } from "../../components/Settings/Settings.js";
async function call(onDone, context) {
  return /* @__PURE__ */ jsx(Settings, { onClose: onDone, context, defaultTab: "Status" });
}
export {
  call
};
