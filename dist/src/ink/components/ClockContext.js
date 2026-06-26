import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { createContext, useEffect, useState } from "react";
import { FRAME_INTERVAL_MS } from "../constants.js";
import { useTerminalFocus } from "../hooks/use-terminal-focus.js";
function createClock(tickIntervalMs) {
  const subscribers = /* @__PURE__ */ new Map();
  let interval = null;
  let currentTickIntervalMs = tickIntervalMs;
  let startTime = 0;
  let tickTime = 0;
  function tick() {
    tickTime = Date.now() - startTime;
    for (const onChange of subscribers.keys()) {
      onChange();
    }
  }
  function updateInterval() {
    const anyKeepAlive = [...subscribers.values()].some(Boolean);
    if (anyKeepAlive) {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      if (startTime === 0) {
        startTime = Date.now();
      }
      interval = setInterval(tick, currentTickIntervalMs);
    } else if (interval) {
      clearInterval(interval);
      interval = null;
    }
  }
  return {
    subscribe(onChange, keepAlive) {
      subscribers.set(onChange, keepAlive);
      updateInterval();
      return () => {
        subscribers.delete(onChange);
        updateInterval();
      };
    },
    now() {
      if (startTime === 0) {
        startTime = Date.now();
      }
      if (interval && tickTime) {
        return tickTime;
      }
      return Date.now() - startTime;
    },
    setTickInterval(ms) {
      if (ms === currentTickIntervalMs) return;
      currentTickIntervalMs = ms;
      updateInterval();
    }
  };
}
const ClockContext = createContext(null);
const BLURRED_TICK_INTERVAL_MS = FRAME_INTERVAL_MS * 2;
function ClockProvider(t0) {
  const $ = _c(7);
  const {
    children
  } = t0;
  const [clock] = useState(_temp);
  const focused = useTerminalFocus();
  let t1;
  let t2;
  if ($[0] !== clock || $[1] !== focused) {
    t1 = () => {
      clock.setTickInterval(focused ? FRAME_INTERVAL_MS : BLURRED_TICK_INTERVAL_MS);
    };
    t2 = [clock, focused];
    $[0] = clock;
    $[1] = focused;
    $[2] = t1;
    $[3] = t2;
  } else {
    t1 = $[2];
    t2 = $[3];
  }
  useEffect(t1, t2);
  let t3;
  if ($[4] !== children || $[5] !== clock) {
    t3 = /* @__PURE__ */ jsx(ClockContext.Provider, { value: clock, children });
    $[4] = children;
    $[5] = clock;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  return t3;
}
function _temp() {
  return createClock(FRAME_INTERVAL_MS);
}
export {
  ClockContext,
  ClockProvider,
  createClock
};
