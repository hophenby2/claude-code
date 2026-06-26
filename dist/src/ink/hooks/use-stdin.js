import { useContext } from "react";
import StdinContext from "../components/StdinContext.js";
const useStdin = () => useContext(StdinContext);
var use_stdin_default = useStdin;
export {
  use_stdin_default as default
};
