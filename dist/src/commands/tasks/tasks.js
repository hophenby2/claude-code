import { jsx } from "react/jsx-runtime";
import { BackgroundTasksDialog } from "../../components/tasks/BackgroundTasksDialog.js";
async function call(onDone, context) {
  return /* @__PURE__ */ jsx(BackgroundTasksDialog, { toolUseContext: context, onDone });
}
export {
  call
};
