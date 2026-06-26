import { useEffect, useLayoutEffect } from "react";
import { useEventCallback } from "usehooks-ts";
import useStdin from "./use-stdin.js";
const useInput = (inputHandler, options = {}) => {
  const { setRawMode, internal_exitOnCtrlC, internal_eventEmitter } = useStdin();
  useLayoutEffect(() => {
    if (options.isActive === false) {
      return;
    }
    setRawMode(true);
    return () => {
      setRawMode(false);
    };
  }, [options.isActive, setRawMode]);
  const handleData = useEventCallback((event) => {
    if (options.isActive === false) {
      return;
    }
    const { input, key } = event;
    if (!(input === "c" && key.ctrl) || !internal_exitOnCtrlC) {
      inputHandler(input, key, event);
    }
  });
  useEffect(() => {
    internal_eventEmitter?.on("input", handleData);
    return () => {
      internal_eventEmitter?.removeListener("input", handleData);
    };
  }, [internal_eventEmitter, handleData]);
};
var use_input_default = useInput;
export {
  use_input_default as default
};
