import { jsx } from "react/jsx-runtime";
import { Settings } from "../../components/Settings/Settings.js";
const call = async (onDone, context) => {
  return /* @__PURE__ */ jsx(Settings, { onClose: onDone, context, defaultTab: "Config" });
};
export {
  call
};
