import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { createContext, useContext, useEffect, useState } from "react";
const DataContext = createContext(null);
const SetContext = createContext(null);
const DialogContext = createContext(null);
const SetDialogContext = createContext(null);
function PromptOverlayProvider(t0) {
  const $ = _c(6);
  const {
    children
  } = t0;
  const [data, setData] = useState(null);
  const [dialog, setDialog] = useState(null);
  let t1;
  if ($[0] !== children || $[1] !== dialog) {
    t1 = /* @__PURE__ */ jsx(DialogContext.Provider, { value: dialog, children });
    $[0] = children;
    $[1] = dialog;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  let t2;
  if ($[3] !== data || $[4] !== t1) {
    t2 = /* @__PURE__ */ jsx(SetContext.Provider, { value: setData, children: /* @__PURE__ */ jsx(SetDialogContext.Provider, { value: setDialog, children: /* @__PURE__ */ jsx(DataContext.Provider, { value: data, children: t1 }) }) });
    $[3] = data;
    $[4] = t1;
    $[5] = t2;
  } else {
    t2 = $[5];
  }
  return t2;
}
function usePromptOverlay() {
  return useContext(DataContext);
}
function usePromptOverlayDialog() {
  return useContext(DialogContext);
}
function useSetPromptOverlay(data) {
  const $ = _c(4);
  const set = useContext(SetContext);
  let t0;
  let t1;
  if ($[0] !== data || $[1] !== set) {
    t0 = () => {
      if (!set) {
        return;
      }
      set(data);
      return () => set(null);
    };
    t1 = [set, data];
    $[0] = data;
    $[1] = set;
    $[2] = t0;
    $[3] = t1;
  } else {
    t0 = $[2];
    t1 = $[3];
  }
  useEffect(t0, t1);
}
function useSetPromptOverlayDialog(node) {
  const $ = _c(4);
  const set = useContext(SetDialogContext);
  let t0;
  let t1;
  if ($[0] !== node || $[1] !== set) {
    t0 = () => {
      if (!set) {
        return;
      }
      set(node);
      return () => set(null);
    };
    t1 = [set, node];
    $[0] = node;
    $[1] = set;
    $[2] = t0;
    $[3] = t1;
  } else {
    t0 = $[2];
    t1 = $[3];
  }
  useEffect(t0, t1);
}
export {
  PromptOverlayProvider,
  usePromptOverlay,
  usePromptOverlayDialog,
  useSetPromptOverlay,
  useSetPromptOverlayDialog
};
