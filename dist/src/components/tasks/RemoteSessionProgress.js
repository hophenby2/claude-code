import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { useRef } from "react";
import { DIAMOND_FILLED, DIAMOND_OPEN } from "../../constants/figures.js";
import { useSettings } from "../../hooks/useSettings.js";
import { Text, useAnimationFrame } from "../../ink.js";
import { count } from "../../utils/array.js";
import { getRainbowColor } from "../../utils/thinking.js";
const TICK_MS = 80;
function formatReviewStageCounts(stage, found, verified, refuted) {
  if (!stage) return `${found} found \xB7 ${verified} verified`;
  if (stage === "synthesizing") {
    const parts = [`${verified} verified`];
    if (refuted > 0) parts.push(`${refuted} refuted`);
    parts.push("deduping");
    return parts.join(" \xB7 ");
  }
  if (stage === "verifying") {
    const parts = [`${found} found`, `${verified} verified`];
    if (refuted > 0) parts.push(`${refuted} refuted`);
    return parts.join(" \xB7 ");
  }
  return found > 0 ? `${found} found` : "finding";
}
function RainbowText(t0) {
  const $ = _c(5);
  const {
    text,
    phase: t1
  } = t0;
  const phase = t1 === void 0 ? 0 : t1;
  let t2;
  if ($[0] !== text) {
    t2 = [...text];
    $[0] = text;
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  let t3;
  if ($[2] !== phase || $[3] !== t2) {
    t3 = /* @__PURE__ */ jsx(Fragment, { children: t2.map((ch, i) => /* @__PURE__ */ jsx(Text, { color: getRainbowColor(i + phase), children: ch }, i)) });
    $[2] = phase;
    $[3] = t2;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  return t3;
}
function useSmoothCount(target, time, snap) {
  const displayed = useRef(target);
  const lastTick = useRef(time);
  if (snap || target < displayed.current) {
    displayed.current = target;
  } else if (target > displayed.current && time !== lastTick.current) {
    displayed.current += 1;
    lastTick.current = time;
  }
  return displayed.current;
}
function ReviewRainbowLine(t0) {
  const $ = _c(15);
  const {
    session
  } = t0;
  const settings = useSettings();
  const reducedMotion = settings.prefersReducedMotion ?? false;
  const p = session.reviewProgress;
  const running = session.status === "running";
  const [, time] = useAnimationFrame(running && !reducedMotion ? TICK_MS : null);
  const targetFound = p?.bugsFound ?? 0;
  const targetVerified = p?.bugsVerified ?? 0;
  const targetRefuted = p?.bugsRefuted ?? 0;
  const snap = reducedMotion || !running;
  const found = useSmoothCount(targetFound, time, snap);
  const verified = useSmoothCount(targetVerified, time, snap);
  const refuted = useSmoothCount(targetRefuted, time, snap);
  const phase = Math.floor(time / (TICK_MS * 3)) % 7;
  if (session.status === "completed") {
    let t12;
    if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t12 = /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs(Text, { color: "background", children: [
          DIAMOND_FILLED,
          " "
        ] }),
        /* @__PURE__ */ jsx(RainbowText, { text: "ultrareview", phase: 0 }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: " ready \xB7 shift+\u2193 to view" })
      ] });
      $[0] = t12;
    } else {
      t12 = $[0];
    }
    return t12;
  }
  if (session.status === "failed") {
    let t12;
    if ($[1] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t12 = /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs(Text, { color: "background", children: [
          DIAMOND_FILLED,
          " "
        ] }),
        /* @__PURE__ */ jsx(RainbowText, { text: "ultrareview", phase: 0 }),
        /* @__PURE__ */ jsxs(Text, { color: "error", dimColor: true, children: [
          " \xB7 ",
          "error"
        ] })
      ] });
      $[1] = t12;
    } else {
      t12 = $[1];
    }
    return t12;
  }
  let t1;
  if ($[2] !== found || $[3] !== p || $[4] !== refuted || $[5] !== verified) {
    t1 = !p ? "setting up" : formatReviewStageCounts(p.stage, found, verified, refuted);
    $[2] = found;
    $[3] = p;
    $[4] = refuted;
    $[5] = verified;
    $[6] = t1;
  } else {
    t1 = $[6];
  }
  const tail = t1;
  let t2;
  if ($[7] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = /* @__PURE__ */ jsxs(Text, { color: "background", children: [
      DIAMOND_OPEN,
      " "
    ] });
    $[7] = t2;
  } else {
    t2 = $[7];
  }
  const t3 = running ? phase : 0;
  let t4;
  if ($[8] !== t3) {
    t4 = /* @__PURE__ */ jsx(RainbowText, { text: "ultrareview", phase: t3 });
    $[8] = t3;
    $[9] = t4;
  } else {
    t4 = $[9];
  }
  let t5;
  if ($[10] !== tail) {
    t5 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      " \xB7 ",
      tail
    ] });
    $[10] = tail;
    $[11] = t5;
  } else {
    t5 = $[11];
  }
  let t6;
  if ($[12] !== t4 || $[13] !== t5) {
    t6 = /* @__PURE__ */ jsxs(Fragment, { children: [
      t2,
      t4,
      t5
    ] });
    $[12] = t4;
    $[13] = t5;
    $[14] = t6;
  } else {
    t6 = $[14];
  }
  return t6;
}
function RemoteSessionProgress(t0) {
  const $ = _c(11);
  const {
    session
  } = t0;
  if (session.isRemoteReview) {
    let t12;
    if ($[0] !== session) {
      t12 = /* @__PURE__ */ jsx(ReviewRainbowLine, { session });
      $[0] = session;
      $[1] = t12;
    } else {
      t12 = $[1];
    }
    return t12;
  }
  if (session.status === "completed") {
    let t12;
    if ($[2] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t12 = /* @__PURE__ */ jsx(Text, { bold: true, color: "success", dimColor: true, children: "done" });
      $[2] = t12;
    } else {
      t12 = $[2];
    }
    return t12;
  }
  if (session.status === "failed") {
    let t12;
    if ($[3] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t12 = /* @__PURE__ */ jsx(Text, { bold: true, color: "error", dimColor: true, children: "error" });
      $[3] = t12;
    } else {
      t12 = $[3];
    }
    return t12;
  }
  if (!session.todoList.length) {
    let t12;
    if ($[4] !== session.status) {
      t12 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        session.status,
        "\u2026"
      ] });
      $[4] = session.status;
      $[5] = t12;
    } else {
      t12 = $[5];
    }
    return t12;
  }
  let t1;
  if ($[6] !== session.todoList) {
    t1 = count(session.todoList, _temp);
    $[6] = session.todoList;
    $[7] = t1;
  } else {
    t1 = $[7];
  }
  const completed = t1;
  const total = session.todoList.length;
  let t2;
  if ($[8] !== completed || $[9] !== total) {
    t2 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      completed,
      "/",
      total
    ] });
    $[8] = completed;
    $[9] = total;
    $[10] = t2;
  } else {
    t2 = $[10];
  }
  return t2;
}
function _temp(_) {
  return _.status === "completed";
}
export {
  RemoteSessionProgress,
  formatReviewStageCounts
};
