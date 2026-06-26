import { useContext } from "react";
import TerminalFocusContext from "../components/TerminalFocusContext.js";
function useTerminalFocus() {
  const { isTerminalFocused } = useContext(TerminalFocusContext);
  return isTerminalFocused;
}
export {
  useTerminalFocus
};
