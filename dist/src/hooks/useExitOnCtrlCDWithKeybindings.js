import { useKeybindings } from "../keybindings/useKeybinding.js";
import { useExitOnCtrlCD } from "./useExitOnCtrlCD.js";
function useExitOnCtrlCDWithKeybindings(onExit, onInterrupt, isActive) {
  return useExitOnCtrlCD(useKeybindings, onInterrupt, onExit, isActive);
}
export {
  useExitOnCtrlCDWithKeybindings
};
