import { useEffect, useState } from "react";
const HINT_DISPLAY_DURATION_MS = 5e3;
let hasShownThisSession = false;
function useShowFastIconHint(showFastIcon) {
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    if (hasShownThisSession || !showFastIcon) {
      return;
    }
    hasShownThisSession = true;
    setShowHint(true);
    const timer = setTimeout(setShowHint, HINT_DISPLAY_DURATION_MS, false);
    return () => {
      clearTimeout(timer);
      setShowHint(false);
    };
  }, [showFastIcon]);
  return showHint;
}
export {
  useShowFastIconHint
};
