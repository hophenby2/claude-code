import { createContext } from "react";
import { EventEmitter } from "../events/emitter.js";
const StdinContext = createContext({
  stdin: process.stdin,
  internal_eventEmitter: new EventEmitter(),
  setRawMode() {
  },
  isRawModeSupported: false,
  internal_exitOnCtrlC: true,
  internal_querier: null
});
StdinContext.displayName = "InternalStdinContext";
var StdinContext_default = StdinContext;
export {
  StdinContext_default as default
};
