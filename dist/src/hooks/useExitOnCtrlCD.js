import { useCallback, useMemo, useState } from "react";
import useApp from "../ink/hooks/use-app.js";
import { useDoublePress } from "./useDoublePress.js";
function useExitOnCtrlCD(useKeybindingsHook, onInterrupt, onExit, isActive = true) {
  const { exit } = useApp();
  const [exitState, setExitState] = useState({
    pending: false,
    keyName: null
  });
  const exitFn = useMemo(() => onExit ?? exit, [onExit, exit]);
  const handleCtrlCDoublePress = useDoublePress(
    (pending) => setExitState({ pending, keyName: "Ctrl-C" }),
    exitFn
  );
  const handleCtrlDDoublePress = useDoublePress(
    (pending) => setExitState({ pending, keyName: "Ctrl-D" }),
    exitFn
  );
  const handleInterrupt = useCallback(() => {
    if (onInterrupt?.()) return;
    handleCtrlCDoublePress();
  }, [handleCtrlCDoublePress, onInterrupt]);
  const handleExit = useCallback(() => {
    handleCtrlDDoublePress();
  }, [handleCtrlDDoublePress]);
  const handlers = useMemo(
    () => ({
      "app:interrupt": handleInterrupt,
      "app:exit": handleExit
    }),
    [handleInterrupt, handleExit]
  );
  useKeybindingsHook(handlers, { context: "Global", isActive });
  return exitState;
}
export {
  useExitOnCtrlCD
};
