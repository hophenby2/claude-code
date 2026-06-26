import { jsx } from "react/jsx-runtime";
import { PermissionRuleList } from "../../components/permissions/rules/PermissionRuleList.js";
import { createPermissionRetryMessage } from "../../utils/messages.js";
const call = async (onDone, context) => {
  return /* @__PURE__ */ jsx(PermissionRuleList, { onExit: onDone, onRetryDenials: (commands) => {
    context.setMessages((prev) => [...prev, createPermissionRetryMessage(commands)]);
  } });
};
export {
  call
};
