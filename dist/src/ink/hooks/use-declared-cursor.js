import { useCallback, useContext, useLayoutEffect, useRef } from "react";
import CursorDeclarationContext from "../components/CursorDeclarationContext.js";
function useDeclaredCursor({
  line,
  column,
  active
}) {
  const setCursorDeclaration = useContext(CursorDeclarationContext);
  const nodeRef = useRef(null);
  const setNode = useCallback((node) => {
    nodeRef.current = node;
  }, []);
  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (active && node) {
      setCursorDeclaration({ relativeX: column, relativeY: line, node });
    } else {
      setCursorDeclaration(null, node);
    }
  });
  useLayoutEffect(() => {
    return () => {
      setCursorDeclaration(null, nodeRef.current);
    };
  }, [setCursorDeclaration]);
  return setNode;
}
export {
  useDeclaredCursor
};
