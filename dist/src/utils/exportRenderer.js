import { jsx } from "react/jsx-runtime";
import { useRef } from "react";
import stripAnsi from "strip-ansi";
import { Messages } from "../components/Messages.js";
import { KeybindingProvider } from "../keybindings/KeybindingContext.js";
import { loadKeybindingsSyncWithWarnings } from "../keybindings/loadUserBindings.js";
import { AppStateProvider } from "../state/AppState.js";
import { renderToAnsiString } from "./staticRender.js";
function StaticKeybindingProvider({
  children
}) {
  const {
    bindings
  } = loadKeybindingsSyncWithWarnings();
  const pendingChordRef = useRef(null);
  const handlerRegistryRef = useRef(/* @__PURE__ */ new Map());
  const activeContexts = useRef(/* @__PURE__ */ new Set()).current;
  return /* @__PURE__ */ jsx(KeybindingProvider, { bindings, pendingChordRef, pendingChord: null, setPendingChord: () => {
  }, activeContexts, registerActiveContext: () => {
  }, unregisterActiveContext: () => {
  }, handlerRegistryRef, children });
}
function normalizedUpperBound(m) {
  if (!("message" in m)) return 1;
  const c = m.message.content;
  return Array.isArray(c) ? c.length : 1;
}
async function streamRenderedMessages(messages, tools, sink, {
  columns,
  verbose = false,
  chunkSize = 40,
  onProgress
} = {}) {
  const renderChunk = (range) => renderToAnsiString(/* @__PURE__ */ jsx(AppStateProvider, { children: /* @__PURE__ */ jsx(StaticKeybindingProvider, { children: /* @__PURE__ */ jsx(Messages, { messages, tools, commands: [], verbose, toolJSX: null, toolUseConfirmQueue: [], inProgressToolUseIDs: /* @__PURE__ */ new Set(), isMessageSelectorVisible: false, conversationId: "export", screen: "prompt", streamingToolUses: [], showAllInTranscript: true, isLoading: false, renderRange: range }) }) }), columns);
  let ceiling = chunkSize;
  for (const m of messages) ceiling += normalizedUpperBound(m);
  for (let offset = 0; offset < ceiling; offset += chunkSize) {
    const ansi = await renderChunk([offset, offset + chunkSize]);
    if (stripAnsi(ansi).trim() === "") break;
    await sink(ansi);
    onProgress?.(offset + chunkSize);
  }
}
async function renderMessagesToPlainText(messages, tools = [], columns) {
  const parts = [];
  await streamRenderedMessages(messages, tools, (chunk) => void parts.push(stripAnsi(chunk)), {
    columns
  });
  return parts.join("");
}
export {
  renderMessagesToPlainText,
  streamRenderedMessages
};
