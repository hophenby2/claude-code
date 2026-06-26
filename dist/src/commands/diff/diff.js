import { jsx } from "react/jsx-runtime";
const call = async (onDone, context) => {
  const {
    DiffDialog
  } = await import("../../components/diff/DiffDialog.js");
  return /* @__PURE__ */ jsx(DiffDialog, { messages: context.messages, onDone });
};
export {
  call
};
