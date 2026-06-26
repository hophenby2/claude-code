import { useEffect, useState } from "react";
function useTimeout(delay, resetTrigger) {
  const [isElapsed, setIsElapsed] = useState(false);
  useEffect(() => {
    setIsElapsed(false);
    const timer = setTimeout(setIsElapsed, delay, true);
    return () => clearTimeout(timer);
  }, [delay, resetTrigger]);
  return isElapsed;
}
export {
  useTimeout
};
