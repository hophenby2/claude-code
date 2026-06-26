const HANDLER_FOR_EVENT = {
  keydown: { bubble: "onKeyDown", capture: "onKeyDownCapture" },
  focus: { bubble: "onFocus", capture: "onFocusCapture" },
  blur: { bubble: "onBlur", capture: "onBlurCapture" },
  paste: { bubble: "onPaste", capture: "onPasteCapture" },
  resize: { bubble: "onResize" },
  click: { bubble: "onClick" }
};
const EVENT_HANDLER_PROPS = /* @__PURE__ */ new Set([
  "onKeyDown",
  "onKeyDownCapture",
  "onFocus",
  "onFocusCapture",
  "onBlur",
  "onBlurCapture",
  "onPaste",
  "onPasteCapture",
  "onResize",
  "onClick",
  "onMouseEnter",
  "onMouseLeave"
]);
export {
  EVENT_HANDLER_PROPS,
  HANDLER_FOR_EVENT
};
