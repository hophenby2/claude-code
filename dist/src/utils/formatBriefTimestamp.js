function formatBriefTimestamp(isoString, now = /* @__PURE__ */ new Date()) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  const locale = getLocale();
  const dayDiff = startOfDay(now) - startOfDay(d);
  const daysAgo = Math.round(dayDiff / 864e5);
  if (daysAgo === 0) {
    return d.toLocaleTimeString(locale, {
      hour: "numeric",
      minute: "2-digit"
    });
  }
  if (daysAgo > 0 && daysAgo < 7) {
    return d.toLocaleString(locale, {
      weekday: "long",
      hour: "numeric",
      minute: "2-digit"
    });
  }
  return d.toLocaleString(locale, {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}
function getLocale() {
  const raw = process.env.LC_ALL || process.env.LC_TIME || process.env.LANG || "";
  if (!raw || raw === "C" || raw === "POSIX") {
    return void 0;
  }
  const base = raw.split(".")[0].split("@")[0];
  if (!base) {
    return void 0;
  }
  const tag = base.replaceAll("_", "-");
  try {
    new Intl.DateTimeFormat(tag);
    return tag;
  } catch {
    return void 0;
  }
}
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
export {
  formatBriefTimestamp
};
