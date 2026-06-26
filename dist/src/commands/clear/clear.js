import { clearConversation } from "./conversation.js";
const call = async (_, context) => {
  await clearConversation(context);
  return { type: "text", value: "" };
};
export {
  call
};
