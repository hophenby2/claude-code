import { jsx } from "react/jsx-runtime";
import { RemoteEnvironmentDialog } from "../../components/RemoteEnvironmentDialog.js";
async function call(onDone) {
  return /* @__PURE__ */ jsx(RemoteEnvironmentDialog, { onDone });
}
export {
  call
};
