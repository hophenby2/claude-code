import { jsx } from "react/jsx-runtime";
import { DesktopHandoff } from "../../components/DesktopHandoff.js";
async function call(onDone) {
  return /* @__PURE__ */ jsx(DesktopHandoff, { onDone });
}
export {
  call
};
