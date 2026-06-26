import { useContext, useEffect, useRef } from "react";
import {
  CLEAR_TAB_STATUS,
  supportsTabStatus,
  tabStatus,
  wrapForMultiplexer
} from "../termio/osc.js";
import { TerminalWriteContext } from "../useTerminalNotification.js";
const rgb = (r, g, b) => ({
  type: "rgb",
  r,
  g,
  b
});
const TAB_STATUS_PRESETS = {
  idle: {
    indicator: rgb(0, 215, 95),
    status: "Idle",
    statusColor: rgb(136, 136, 136)
  },
  busy: {
    indicator: rgb(255, 149, 0),
    status: "Working\u2026",
    statusColor: rgb(255, 149, 0)
  },
  waiting: {
    indicator: rgb(95, 135, 255),
    status: "Waiting",
    statusColor: rgb(95, 135, 255)
  }
};
function useTabStatus(kind) {
  const writeRaw = useContext(TerminalWriteContext);
  const prevKindRef = useRef(null);
  useEffect(() => {
    if (kind === null) {
      if (prevKindRef.current !== null && writeRaw && supportsTabStatus()) {
        writeRaw(wrapForMultiplexer(CLEAR_TAB_STATUS));
      }
      prevKindRef.current = null;
      return;
    }
    prevKindRef.current = kind;
    if (!writeRaw || !supportsTabStatus()) return;
    writeRaw(wrapForMultiplexer(tabStatus(TAB_STATUS_PRESETS[kind])));
  }, [kind, writeRaw]);
}
export {
  useTabStatus
};
