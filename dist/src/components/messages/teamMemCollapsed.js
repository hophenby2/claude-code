import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Text } from "../../ink.js";
function checkHasTeamMemOps(message) {
  return (message.teamMemorySearchCount ?? 0) > 0 || (message.teamMemoryReadCount ?? 0) > 0 || (message.teamMemoryWriteCount ?? 0) > 0;
}
function TeamMemCountParts(t0) {
  const $ = _c(23);
  const {
    message,
    isActiveGroup,
    hasPrecedingParts
  } = t0;
  const tmReadCount = message.teamMemoryReadCount ?? 0;
  const tmSearchCount = message.teamMemorySearchCount ?? 0;
  const tmWriteCount = message.teamMemoryWriteCount ?? 0;
  if (tmReadCount === 0 && tmSearchCount === 0 && tmWriteCount === 0) {
    return null;
  }
  let t1;
  if ($[0] !== hasPrecedingParts || $[1] !== isActiveGroup || $[2] !== tmReadCount || $[3] !== tmSearchCount || $[4] !== tmWriteCount) {
    const nodes = [];
    let count = hasPrecedingParts ? 1 : 0;
    if (tmReadCount > 0) {
      const verb = isActiveGroup ? count === 0 ? "Recalling" : "recalling" : count === 0 ? "Recalled" : "recalled";
      if (count > 0) {
        let t22;
        if ($[6] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
          t22 = /* @__PURE__ */ jsx(Text, { children: ", " }, "comma-tmr");
          $[6] = t22;
        } else {
          t22 = $[6];
        }
        nodes.push(t22);
      }
      let t2;
      if ($[7] !== tmReadCount) {
        t2 = /* @__PURE__ */ jsx(Text, { bold: true, children: tmReadCount });
        $[7] = tmReadCount;
        $[8] = t2;
      } else {
        t2 = $[8];
      }
      const t3 = tmReadCount === 1 ? "memory" : "memories";
      let t4;
      if ($[9] !== t2 || $[10] !== t3 || $[11] !== verb) {
        t4 = /* @__PURE__ */ jsxs(Text, { children: [
          verb,
          " ",
          t2,
          " team",
          " ",
          t3
        ] }, "team-mem-read");
        $[9] = t2;
        $[10] = t3;
        $[11] = verb;
        $[12] = t4;
      } else {
        t4 = $[12];
      }
      nodes.push(t4);
      count++;
    }
    if (tmSearchCount > 0) {
      const verb_0 = isActiveGroup ? count === 0 ? "Searching" : "searching" : count === 0 ? "Searched" : "searched";
      if (count > 0) {
        let t22;
        if ($[13] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
          t22 = /* @__PURE__ */ jsx(Text, { children: ", " }, "comma-tms");
          $[13] = t22;
        } else {
          t22 = $[13];
        }
        nodes.push(t22);
      }
      const t2 = `${verb_0} team memories`;
      let t3;
      if ($[14] !== t2) {
        t3 = /* @__PURE__ */ jsx(Text, { children: t2 }, "team-mem-search");
        $[14] = t2;
        $[15] = t3;
      } else {
        t3 = $[15];
      }
      nodes.push(t3);
      count++;
    }
    if (tmWriteCount > 0) {
      const verb_1 = isActiveGroup ? count === 0 ? "Writing" : "writing" : count === 0 ? "Wrote" : "wrote";
      if (count > 0) {
        let t22;
        if ($[16] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
          t22 = /* @__PURE__ */ jsx(Text, { children: ", " }, "comma-tmw");
          $[16] = t22;
        } else {
          t22 = $[16];
        }
        nodes.push(t22);
      }
      let t2;
      if ($[17] !== tmWriteCount) {
        t2 = /* @__PURE__ */ jsx(Text, { bold: true, children: tmWriteCount });
        $[17] = tmWriteCount;
        $[18] = t2;
      } else {
        t2 = $[18];
      }
      const t3 = tmWriteCount === 1 ? "memory" : "memories";
      let t4;
      if ($[19] !== t2 || $[20] !== t3 || $[21] !== verb_1) {
        t4 = /* @__PURE__ */ jsxs(Text, { children: [
          verb_1,
          " ",
          t2,
          " team",
          " ",
          t3
        ] }, "team-mem-write");
        $[19] = t2;
        $[20] = t3;
        $[21] = verb_1;
        $[22] = t4;
      } else {
        t4 = $[22];
      }
      nodes.push(t4);
    }
    t1 = /* @__PURE__ */ jsx(Fragment, { children: nodes });
    $[0] = hasPrecedingParts;
    $[1] = isActiveGroup;
    $[2] = tmReadCount;
    $[3] = tmSearchCount;
    $[4] = tmWriteCount;
    $[5] = t1;
  } else {
    t1 = $[5];
  }
  return t1;
}
export {
  TeamMemCountParts,
  checkHasTeamMemOps
};
