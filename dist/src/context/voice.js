import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { createContext, useContext, useState, useSyncExternalStore } from "react";
import { createStore } from "../state/store.js";
const DEFAULT_STATE = {
  voiceState: "idle",
  voiceError: null,
  voiceInterimTranscript: "",
  voiceAudioLevels: [],
  voiceWarmingUp: false
};
const VoiceContext = createContext(null);
function VoiceProvider(t0) {
  const $ = _c(3);
  const {
    children
  } = t0;
  const [store] = useState(_temp);
  let t1;
  if ($[0] !== children || $[1] !== store) {
    t1 = /* @__PURE__ */ jsx(VoiceContext.Provider, { value: store, children });
    $[0] = children;
    $[1] = store;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  return t1;
}
function _temp() {
  return createStore(DEFAULT_STATE);
}
function useVoiceStore() {
  const store = useContext(VoiceContext);
  if (!store) {
    throw new Error("useVoiceState must be used within a VoiceProvider");
  }
  return store;
}
function useVoiceState(selector) {
  const $ = _c(3);
  const store = useVoiceStore();
  let t0;
  if ($[0] !== selector || $[1] !== store) {
    t0 = () => selector(store.getState());
    $[0] = selector;
    $[1] = store;
    $[2] = t0;
  } else {
    t0 = $[2];
  }
  const get = t0;
  return useSyncExternalStore(store.subscribe, get, get);
}
function useSetVoiceState() {
  return useVoiceStore().setState;
}
function useGetVoiceState() {
  return useVoiceStore().getState;
}
export {
  VoiceProvider,
  useGetVoiceState,
  useSetVoiceState,
  useVoiceState
};
