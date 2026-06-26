import memoize from "lodash-es/memoize.js";
function getLocalISODate() {
  if (process.env.CLAUDE_CODE_OVERRIDE_DATE) {
    return process.env.CLAUDE_CODE_OVERRIDE_DATE;
  }
  const now = /* @__PURE__ */ new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
const getSessionStartDate = memoize(getLocalISODate);
function getLocalMonthYear() {
  const date = process.env.CLAUDE_CODE_OVERRIDE_DATE ? new Date(process.env.CLAUDE_CODE_OVERRIDE_DATE) : /* @__PURE__ */ new Date();
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}
export {
  getLocalISODate,
  getLocalMonthYear,
  getSessionStartDate
};
