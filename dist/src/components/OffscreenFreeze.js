import { jsx } from "react/jsx-runtime";
import { useContext, useRef } from "react";
import { useTerminalViewport } from "../ink/hooks/use-terminal-viewport.js";
import { Box } from "../ink.js";
import { InVirtualListContext } from "./messageActions.js";
function OffscreenFreeze({
  children
}) {
  "use no memo";
  const inVirtualList = useContext(InVirtualListContext);
  const [ref, {
    isVisible
  }] = useTerminalViewport();
  const cached = useRef(children);
  if (isVisible || inVirtualList) {
    cached.current = children;
  }
  return /* @__PURE__ */ jsx(Box, { ref, children: cached.current });
}
export {
  OffscreenFreeze
};
