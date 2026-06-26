import { c as _c } from "react/compiler-runtime";
import { createContext, useContext } from "react";
const ModalContext = createContext(null);
function useIsInsideModal() {
  return useContext(ModalContext) !== null;
}
function useModalOrTerminalSize(fallback) {
  const $ = _c(3);
  const ctx = useContext(ModalContext);
  let t0;
  if ($[0] !== ctx || $[1] !== fallback) {
    t0 = ctx ? {
      rows: ctx.rows,
      columns: ctx.columns
    } : fallback;
    $[0] = ctx;
    $[1] = fallback;
    $[2] = t0;
  } else {
    t0 = $[2];
  }
  return t0;
}
function useModalScrollRef() {
  return useContext(ModalContext)?.scrollRef ?? null;
}
export {
  ModalContext,
  useIsInsideModal,
  useModalOrTerminalSize,
  useModalScrollRef
};
