import { jsx } from "react/jsx-runtime";
import { Stats } from "../../components/Stats.js";
const call = async (onDone) => {
  return /* @__PURE__ */ jsx(Stats, { onClose: onDone });
};
export {
  call
};
