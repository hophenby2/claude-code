import { jsx } from "react/jsx-runtime";
import { Feedback } from "../../components/Feedback.js";
function renderFeedbackComponent(onDone, abortSignal, messages, initialDescription = "", backgroundTasks = {}) {
  return /* @__PURE__ */ jsx(Feedback, { abortSignal, messages, initialDescription, onDone, backgroundTasks });
}
async function call(onDone, context, args) {
  const initialDescription = args || "";
  return renderFeedbackComponent(onDone, context.abortController.signal, context.messages, initialDescription);
}
export {
  call,
  renderFeedbackComponent
};
