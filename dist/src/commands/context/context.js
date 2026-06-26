import { jsx } from "react/jsx-runtime";
const feature = (_name) => false;
import { ContextVisualization } from "../../components/ContextVisualization.js";
import { microcompactMessages } from "../../services/compact/microCompact.js";
import { analyzeContextUsage } from "../../utils/analyzeContext.js";
import { getMessagesAfterCompactBoundary } from "../../utils/messages.js";
import { renderToAnsiString } from "../../utils/staticRender.js";
function toApiView(messages) {
  let view = getMessagesAfterCompactBoundary(messages);
  if (false) {
    const {
      projectView
    } = null;
    view = projectView(view);
  }
  return view;
}
async function call(onDone, context) {
  const {
    messages,
    getAppState,
    options: {
      mainLoopModel,
      tools
    }
  } = context;
  const apiView = toApiView(messages);
  const {
    messages: compactedMessages
  } = await microcompactMessages(apiView);
  const terminalWidth = process.stdout.columns || 80;
  const appState = getAppState();
  const data = await analyzeContextUsage(
    compactedMessages,
    mainLoopModel,
    async () => appState.toolPermissionContext,
    tools,
    appState.agentDefinitions,
    terminalWidth,
    context,
    // Pass full context for system prompt calculation
    void 0,
    // mainThreadAgentDefinition
    apiView
    // Original messages for API usage extraction
  );
  const output = await renderToAnsiString(/* @__PURE__ */ jsx(ContextVisualization, { data }));
  onDone(output);
  return null;
}
export {
  call
};
