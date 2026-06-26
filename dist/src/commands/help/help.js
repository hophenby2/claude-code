import { jsx } from "react/jsx-runtime";
import { HelpV2 } from "../../components/HelpV2/HelpV2.js";
const call = async (onDone, {
  options: {
    commands
  }
}) => {
  return /* @__PURE__ */ jsx(HelpV2, { commands, onClose: onDone });
};
export {
  call
};
