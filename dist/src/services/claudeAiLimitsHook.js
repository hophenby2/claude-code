import { useEffect, useState } from "react";
import {
  currentLimits,
  statusListeners
} from "./claudeAiLimits.js";
function useClaudeAiLimits() {
  const [limits, setLimits] = useState({ ...currentLimits });
  useEffect(() => {
    const listener = (newLimits) => {
      setLimits({ ...newLimits });
    };
    statusListeners.add(listener);
    return () => {
      statusListeners.delete(listener);
    };
  }, []);
  return limits;
}
export {
  useClaudeAiLimits
};
