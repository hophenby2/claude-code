import { useContext, useMemo } from "react";
import StdinContext from "../components/StdinContext.js";
import instances from "../instances.js";
function useSearchHighlight() {
  useContext(StdinContext);
  const ink = instances.get(process.stdout);
  return useMemo(() => {
    if (!ink) {
      return {
        setQuery: () => {
        },
        scanElement: () => [],
        setPositions: () => {
        }
      };
    }
    return {
      setQuery: (query) => ink.setSearchHighlight(query),
      scanElement: (el) => ink.scanElementSubtree(el),
      setPositions: (state) => ink.setSearchPositions(state)
    };
  }, [ink]);
}
export {
  useSearchHighlight
};
