import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Box, Text } from "../../ink.js";
import { isShutdownApproved, isShutdownRejected, isShutdownRequest } from "../../utils/teammateMailbox.js";
function ShutdownRequestDisplay(t0) {
  const $ = _c(7);
  const {
    request
  } = t0;
  let t1;
  if ($[0] !== request.from) {
    t1 = /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsxs(Text, { color: "warning", bold: true, children: [
      "Shutdown request from ",
      request.from
    ] }) });
    $[0] = request.from;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== request.reason) {
    t2 = request.reason && /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(Text, { children: [
      "Reason: ",
      request.reason
    ] }) });
    $[2] = request.reason;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== t1 || $[5] !== t2) {
    t3 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginY: 1, children: /* @__PURE__ */ jsxs(Box, { borderStyle: "round", borderColor: "warning", flexDirection: "column", paddingX: 1, paddingY: 1, children: [
      t1,
      t2
    ] }) });
    $[4] = t1;
    $[5] = t2;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  return t3;
}
function ShutdownRejectedDisplay(t0) {
  const $ = _c(8);
  const {
    response
  } = t0;
  let t1;
  if ($[0] !== response.from) {
    t1 = /* @__PURE__ */ jsxs(Text, { color: "subtle", bold: true, children: [
      "Shutdown rejected by ",
      response.from
    ] });
    $[0] = response.from;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== response.reason) {
    t2 = /* @__PURE__ */ jsx(Box, { marginTop: 1, borderStyle: "dashed", borderColor: "subtle", borderLeft: false, borderRight: false, paddingX: 1, children: /* @__PURE__ */ jsxs(Text, { children: [
      "Reason: ",
      response.reason
    ] }) });
    $[2] = response.reason;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t3 = /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Teammate is continuing to work. You may request shutdown again later." }) });
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  let t4;
  if ($[5] !== t1 || $[6] !== t2) {
    t4 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginY: 1, children: /* @__PURE__ */ jsxs(Box, { borderStyle: "round", borderColor: "subtle", flexDirection: "column", paddingX: 1, paddingY: 1, children: [
      t1,
      t2,
      t3
    ] }) });
    $[5] = t1;
    $[6] = t2;
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  return t4;
}
function tryRenderShutdownMessage(content) {
  const request = isShutdownRequest(content);
  if (request) {
    return /* @__PURE__ */ jsx(ShutdownRequestDisplay, { request });
  }
  if (isShutdownApproved(content)) {
    return null;
  }
  const rejected = isShutdownRejected(content);
  if (rejected) {
    return /* @__PURE__ */ jsx(ShutdownRejectedDisplay, { response: rejected });
  }
  return null;
}
function getShutdownMessageSummary(content) {
  const request = isShutdownRequest(content);
  if (request) {
    return `[Shutdown Request from ${request.from}]${request.reason ? ` ${request.reason}` : ""}`;
  }
  const approved = isShutdownApproved(content);
  if (approved) {
    return `[Shutdown Approved] ${approved.from} is now exiting`;
  }
  const rejected = isShutdownRejected(content);
  if (rejected) {
    return `[Shutdown Rejected] ${rejected.from}: ${rejected.reason}`;
  }
  return null;
}
export {
  ShutdownRejectedDisplay,
  ShutdownRequestDisplay,
  getShutdownMessageSummary,
  tryRenderShutdownMessage
};
