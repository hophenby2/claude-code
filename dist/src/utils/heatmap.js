import chalk from "chalk";
import { toDateString } from "./statsCache.js";
function calculatePercentiles(dailyActivity) {
  const counts = dailyActivity.map((a) => a.messageCount).filter((c) => c > 0).sort((a, b) => a - b);
  if (counts.length === 0) return null;
  return {
    p25: counts[Math.floor(counts.length * 0.25)],
    p50: counts[Math.floor(counts.length * 0.5)],
    p75: counts[Math.floor(counts.length * 0.75)]
  };
}
function generateHeatmap(dailyActivity, options = {}) {
  const { terminalWidth = 80, showMonthLabels = true } = options;
  const dayLabelWidth = 4;
  const availableWidth = terminalWidth - dayLabelWidth;
  const width = Math.min(52, Math.max(10, availableWidth));
  const activityMap = /* @__PURE__ */ new Map();
  for (const activity of dailyActivity) {
    activityMap.set(activity.date, activity);
  }
  const percentiles = calculatePercentiles(dailyActivity);
  const today = /* @__PURE__ */ new Date();
  today.setHours(0, 0, 0, 0);
  const currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - today.getDay());
  const startDate = new Date(currentWeekStart);
  startDate.setDate(startDate.getDate() - (width - 1) * 7);
  const grid = Array.from(
    { length: 7 },
    () => Array(width).fill("")
  );
  const monthStarts = [];
  let lastMonth = -1;
  const currentDate = new Date(startDate);
  for (let week = 0; week < width; week++) {
    for (let day = 0; day < 7; day++) {
      if (currentDate > today) {
        grid[day][week] = " ";
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }
      const dateStr = toDateString(currentDate);
      const activity = activityMap.get(dateStr);
      if (day === 0) {
        const month = currentDate.getMonth();
        if (month !== lastMonth) {
          monthStarts.push({ month, week });
          lastMonth = month;
        }
      }
      const intensity = getIntensity(activity?.messageCount || 0, percentiles);
      grid[day][week] = getHeatmapChar(intensity);
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }
  const lines = [];
  if (showMonthLabels) {
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec"
    ];
    const uniqueMonths = monthStarts.map((m) => m.month);
    const labelWidth = Math.floor(width / Math.max(uniqueMonths.length, 1));
    const monthLabels = uniqueMonths.map((month) => monthNames[month].padEnd(labelWidth)).join("");
    lines.push("    " + monthLabels);
  }
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let day = 0; day < 7; day++) {
    const label = [1, 3, 5].includes(day) ? dayLabels[day].padEnd(3) : "   ";
    const row = label + " " + grid[day].join("");
    lines.push(row);
  }
  lines.push("");
  lines.push(
    "    Less " + [
      claudeOrange("\u2591"),
      claudeOrange("\u2592"),
      claudeOrange("\u2593"),
      claudeOrange("\u2588")
    ].join(" ") + " More"
  );
  return lines.join("\n");
}
function getIntensity(messageCount, percentiles) {
  if (messageCount === 0 || !percentiles) return 0;
  if (messageCount >= percentiles.p75) return 4;
  if (messageCount >= percentiles.p50) return 3;
  if (messageCount >= percentiles.p25) return 2;
  return 1;
}
const claudeOrange = chalk.hex("#da7756");
function getHeatmapChar(intensity) {
  switch (intensity) {
    case 0:
      return chalk.gray("\xB7");
    case 1:
      return claudeOrange("\u2591");
    case 2:
      return claudeOrange("\u2592");
    case 3:
      return claudeOrange("\u2593");
    case 4:
      return claudeOrange("\u2588");
    default:
      return chalk.gray("\xB7");
  }
}
export {
  generateHeatmap
};
