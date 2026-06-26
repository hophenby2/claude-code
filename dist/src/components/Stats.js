import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
const feature = (_name) => false;
import { plot as asciichart } from "asciichart";
import chalk from "chalk";
import figures from "figures";
import { Suspense, use, useEffect, useMemo, useState } from "react";
import stripAnsi from "strip-ansi";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { applyColor } from "../ink/colorize.js";
import { stringWidth as getStringWidth } from "../ink/stringWidth.js";
import { Ansi, Box, Text, useInput } from "../ink.js";
import { useKeybinding } from "../keybindings/useKeybinding.js";
import { getGlobalConfig } from "../utils/config.js";
import { formatDuration, formatNumber } from "../utils/format.js";
import { generateHeatmap } from "../utils/heatmap.js";
import { renderModelName } from "../utils/model/model.js";
import { copyAnsiToClipboard } from "../utils/screenshotClipboard.js";
import { aggregateClaudeCodeStatsForRange } from "../utils/stats.js";
import { resolveThemeSetting } from "../utils/systemTheme.js";
import { getTheme, themeColorToAnsi } from "../utils/theme.js";
import { Pane } from "./design-system/Pane.js";
import { Tab, Tabs, useTabHeaderFocus } from "./design-system/Tabs.js";
import { Spinner } from "./Spinner.js";
function formatPeakDay(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}
const DATE_RANGE_LABELS = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time"
};
const DATE_RANGE_ORDER = ["all", "7d", "30d"];
function getNextDateRange(current) {
  const currentIndex = DATE_RANGE_ORDER.indexOf(current);
  return DATE_RANGE_ORDER[(currentIndex + 1) % DATE_RANGE_ORDER.length];
}
function createAllTimeStatsPromise() {
  return aggregateClaudeCodeStatsForRange("all").then((data) => {
    if (!data || data.totalSessions === 0) {
      return {
        type: "empty"
      };
    }
    return {
      type: "success",
      data
    };
  }).catch((err) => {
    const message = err instanceof Error ? err.message : "Failed to load stats";
    return {
      type: "error",
      message
    };
  });
}
function Stats(t0) {
  const $ = _c(4);
  const {
    onClose
  } = t0;
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = createAllTimeStatsPromise();
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const allTimePromise = t1;
  let t2;
  if ($[1] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = /* @__PURE__ */ jsxs(Box, { marginTop: 1, children: [
      /* @__PURE__ */ jsx(Spinner, {}),
      /* @__PURE__ */ jsx(Text, { children: " Loading your Claude Code stats\u2026" })
    ] });
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  let t3;
  if ($[2] !== onClose) {
    t3 = /* @__PURE__ */ jsx(Suspense, { fallback: t2, children: /* @__PURE__ */ jsx(StatsContent, { allTimePromise, onClose }) });
    $[2] = onClose;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  return t3;
}
function StatsContent(t0) {
  const $ = _c(34);
  const {
    allTimePromise,
    onClose
  } = t0;
  const allTimeResult = use(allTimePromise);
  const [dateRange, setDateRange] = useState("all");
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = {};
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const [statsCache, setStatsCache] = useState(t1);
  const [isLoadingFiltered, setIsLoadingFiltered] = useState(false);
  const [activeTab, setActiveTab] = useState("Overview");
  const [copyStatus, setCopyStatus] = useState(null);
  let t2;
  let t3;
  if ($[1] !== dateRange || $[2] !== statsCache) {
    t2 = () => {
      if (dateRange === "all") {
        return;
      }
      if (statsCache[dateRange]) {
        return;
      }
      let cancelled = false;
      setIsLoadingFiltered(true);
      aggregateClaudeCodeStatsForRange(dateRange).then((data) => {
        if (!cancelled) {
          setStatsCache((prev) => ({
            ...prev,
            [dateRange]: data
          }));
          setIsLoadingFiltered(false);
        }
      }).catch(() => {
        if (!cancelled) {
          setIsLoadingFiltered(false);
        }
      });
      return () => {
        cancelled = true;
      };
    };
    t3 = [dateRange, statsCache];
    $[1] = dateRange;
    $[2] = statsCache;
    $[3] = t2;
    $[4] = t3;
  } else {
    t2 = $[3];
    t3 = $[4];
  }
  useEffect(t2, t3);
  const displayStats = dateRange === "all" ? allTimeResult.type === "success" ? allTimeResult.data : null : statsCache[dateRange] ?? (allTimeResult.type === "success" ? allTimeResult.data : null);
  const allTimeStats = allTimeResult.type === "success" ? allTimeResult.data : null;
  let t4;
  if ($[5] !== onClose) {
    t4 = () => {
      onClose("Stats dialog dismissed", {
        display: "system"
      });
    };
    $[5] = onClose;
    $[6] = t4;
  } else {
    t4 = $[6];
  }
  const handleClose = t4;
  let t5;
  if ($[7] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t5 = {
      context: "Confirmation"
    };
    $[7] = t5;
  } else {
    t5 = $[7];
  }
  useKeybinding("confirm:no", handleClose, t5);
  let t6;
  if ($[8] !== activeTab || $[9] !== dateRange || $[10] !== displayStats || $[11] !== onClose) {
    t6 = (input, key) => {
      if (key.ctrl && (input === "c" || input === "d")) {
        onClose("Stats dialog dismissed", {
          display: "system"
        });
      }
      if (key.tab) {
        setActiveTab(_temp);
      }
      if (input === "r" && !key.ctrl && !key.meta) {
        setDateRange(getNextDateRange(dateRange));
      }
      if (key.ctrl && input === "s" && displayStats) {
        handleScreenshot(displayStats, activeTab, setCopyStatus);
      }
    };
    $[8] = activeTab;
    $[9] = dateRange;
    $[10] = displayStats;
    $[11] = onClose;
    $[12] = t6;
  } else {
    t6 = $[12];
  }
  useInput(t6);
  if (allTimeResult.type === "error") {
    let t72;
    if ($[13] !== allTimeResult.message) {
      t72 = /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { color: "error", children: [
        "Failed to load stats: ",
        allTimeResult.message
      ] }) });
      $[13] = allTimeResult.message;
      $[14] = t72;
    } else {
      t72 = $[14];
    }
    return t72;
  }
  if (allTimeResult.type === "empty") {
    let t72;
    if ($[15] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t72 = /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { color: "warning", children: "No stats available yet. Start using Claude Code!" }) });
      $[15] = t72;
    } else {
      t72 = $[15];
    }
    return t72;
  }
  if (!displayStats || !allTimeStats) {
    let t72;
    if ($[16] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t72 = /* @__PURE__ */ jsxs(Box, { marginTop: 1, children: [
        /* @__PURE__ */ jsx(Spinner, {}),
        /* @__PURE__ */ jsx(Text, { children: " Loading stats\u2026" })
      ] });
      $[16] = t72;
    } else {
      t72 = $[16];
    }
    return t72;
  }
  let t7;
  if ($[17] !== allTimeStats || $[18] !== dateRange || $[19] !== displayStats || $[20] !== isLoadingFiltered) {
    t7 = /* @__PURE__ */ jsx(Tab, { title: "Overview", children: /* @__PURE__ */ jsx(OverviewTab, { stats: displayStats, allTimeStats, dateRange, isLoading: isLoadingFiltered }) });
    $[17] = allTimeStats;
    $[18] = dateRange;
    $[19] = displayStats;
    $[20] = isLoadingFiltered;
    $[21] = t7;
  } else {
    t7 = $[21];
  }
  let t8;
  if ($[22] !== dateRange || $[23] !== displayStats || $[24] !== isLoadingFiltered) {
    t8 = /* @__PURE__ */ jsx(Tab, { title: "Models", children: /* @__PURE__ */ jsx(ModelsTab, { stats: displayStats, dateRange, isLoading: isLoadingFiltered }) });
    $[22] = dateRange;
    $[23] = displayStats;
    $[24] = isLoadingFiltered;
    $[25] = t8;
  } else {
    t8 = $[25];
  }
  let t9;
  if ($[26] !== t7 || $[27] !== t8) {
    t9 = /* @__PURE__ */ jsx(Box, { flexDirection: "row", gap: 1, marginBottom: 1, children: /* @__PURE__ */ jsxs(Tabs, { title: "", color: "claude", defaultTab: "Overview", children: [
      t7,
      t8
    ] }) });
    $[26] = t7;
    $[27] = t8;
    $[28] = t9;
  } else {
    t9 = $[28];
  }
  const t10 = copyStatus ? ` \xB7 ${copyStatus}` : "";
  let t11;
  if ($[29] !== t10) {
    t11 = /* @__PURE__ */ jsx(Box, { paddingLeft: 2, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "Esc to cancel \xB7 r to cycle dates \xB7 ctrl+s to copy",
      t10
    ] }) });
    $[29] = t10;
    $[30] = t11;
  } else {
    t11 = $[30];
  }
  let t12;
  if ($[31] !== t11 || $[32] !== t9) {
    t12 = /* @__PURE__ */ jsxs(Pane, { color: "claude", children: [
      t9,
      t11
    ] });
    $[31] = t11;
    $[32] = t9;
    $[33] = t12;
  } else {
    t12 = $[33];
  }
  return t12;
}
function _temp(prev_0) {
  return prev_0 === "Overview" ? "Models" : "Overview";
}
function DateRangeSelector(t0) {
  const $ = _c(9);
  const {
    dateRange,
    isLoading
  } = t0;
  let t1;
  if ($[0] !== dateRange) {
    t1 = DATE_RANGE_ORDER.map((range, i) => /* @__PURE__ */ jsxs(Text, { children: [
      i > 0 && /* @__PURE__ */ jsx(Text, { dimColor: true, children: " \xB7 " }),
      range === dateRange ? /* @__PURE__ */ jsx(Text, { bold: true, color: "claude", children: DATE_RANGE_LABELS[range] }) : /* @__PURE__ */ jsx(Text, { dimColor: true, children: DATE_RANGE_LABELS[range] })
    ] }, range));
    $[0] = dateRange;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== t1) {
    t2 = /* @__PURE__ */ jsx(Box, { children: t1 });
    $[2] = t1;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== isLoading) {
    t3 = isLoading && /* @__PURE__ */ jsx(Spinner, {});
    $[4] = isLoading;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  let t4;
  if ($[6] !== t2 || $[7] !== t3) {
    t4 = /* @__PURE__ */ jsxs(Box, { marginBottom: 1, gap: 1, children: [
      t2,
      t3
    ] });
    $[6] = t2;
    $[7] = t3;
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  return t4;
}
function OverviewTab({
  stats,
  allTimeStats,
  dateRange,
  isLoading
}) {
  const {
    columns: terminalWidth
  } = useTerminalSize();
  const modelEntries = Object.entries(stats.modelUsage).sort(([, a], [, b]) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens));
  const favoriteModel = modelEntries[0];
  const totalTokens = modelEntries.reduce((sum, [, usage]) => sum + usage.inputTokens + usage.outputTokens, 0);
  const factoid = useMemo(() => generateFunFactoid(stats, totalTokens), [stats, totalTokens]);
  const rangeDays = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : stats.totalDays;
  let shotStatsData = null;
  if (false) {
    const dist = stats.shotDistribution;
    const total = Object.values(dist).reduce((s, n) => s + n, 0);
    if (total > 0) {
      const totalShots = Object.entries(dist).reduce((s_0, [count, sessions]) => s_0 + parseInt(count, 10) * sessions, 0);
      const bucket = (min, max) => Object.entries(dist).filter(([k]) => {
        const n_0 = parseInt(k, 10);
        return n_0 >= min && (max === void 0 || n_0 <= max);
      }).reduce((s_1, [, v]) => s_1 + v, 0);
      const pct = (n_1) => Math.round(n_1 / total * 100);
      const b1 = bucket(1, 1);
      const b2_5 = bucket(2, 5);
      const b6_10 = bucket(6, 10);
      const b11 = bucket(11);
      shotStatsData = {
        avgShots: (totalShots / total).toFixed(1),
        buckets: [{
          label: "1-shot",
          count: b1,
          pct: pct(b1)
        }, {
          label: "2\u20135 shot",
          count: b2_5,
          pct: pct(b2_5)
        }, {
          label: "6\u201310 shot",
          count: b6_10,
          pct: pct(b6_10)
        }, {
          label: "11+ shot",
          count: b11,
          pct: pct(b11)
        }]
      };
    }
  }
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
    allTimeStats.dailyActivity.length > 0 && /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginBottom: 1, children: /* @__PURE__ */ jsx(Ansi, { children: generateHeatmap(allTimeStats.dailyActivity, {
      terminalWidth
    }) }) }),
    /* @__PURE__ */ jsx(DateRangeSelector, { dateRange, isLoading }),
    /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 4, marginBottom: 1, children: [
      /* @__PURE__ */ jsx(Box, { flexDirection: "column", width: 28, children: favoriteModel && /* @__PURE__ */ jsxs(Text, { wrap: "truncate", children: [
        "Favorite model:",
        " ",
        /* @__PURE__ */ jsx(Text, { color: "claude", bold: true, children: renderModelName(favoriteModel[0]) })
      ] }) }),
      /* @__PURE__ */ jsx(Box, { flexDirection: "column", width: 28, children: /* @__PURE__ */ jsxs(Text, { wrap: "truncate", children: [
        "Total tokens:",
        " ",
        /* @__PURE__ */ jsx(Text, { color: "claude", children: formatNumber(totalTokens) })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 4, children: [
      /* @__PURE__ */ jsx(Box, { flexDirection: "column", width: 28, children: /* @__PURE__ */ jsxs(Text, { wrap: "truncate", children: [
        "Sessions:",
        " ",
        /* @__PURE__ */ jsx(Text, { color: "claude", children: formatNumber(stats.totalSessions) })
      ] }) }),
      /* @__PURE__ */ jsx(Box, { flexDirection: "column", width: 28, children: stats.longestSession && /* @__PURE__ */ jsxs(Text, { wrap: "truncate", children: [
        "Longest session:",
        " ",
        /* @__PURE__ */ jsx(Text, { color: "claude", children: formatDuration(stats.longestSession.duration) })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 4, children: [
      /* @__PURE__ */ jsx(Box, { flexDirection: "column", width: 28, children: /* @__PURE__ */ jsxs(Text, { wrap: "truncate", children: [
        "Active days: ",
        /* @__PURE__ */ jsx(Text, { color: "claude", children: stats.activeDays }),
        /* @__PURE__ */ jsxs(Text, { color: "subtle", children: [
          "/",
          rangeDays
        ] })
      ] }) }),
      /* @__PURE__ */ jsx(Box, { flexDirection: "column", width: 28, children: /* @__PURE__ */ jsxs(Text, { wrap: "truncate", children: [
        "Longest streak:",
        " ",
        /* @__PURE__ */ jsx(Text, { color: "claude", bold: true, children: stats.streaks.longestStreak }),
        " ",
        stats.streaks.longestStreak === 1 ? "day" : "days"
      ] }) })
    ] }),
    /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 4, children: [
      /* @__PURE__ */ jsx(Box, { flexDirection: "column", width: 28, children: stats.peakActivityDay && /* @__PURE__ */ jsxs(Text, { wrap: "truncate", children: [
        "Most active day:",
        " ",
        /* @__PURE__ */ jsx(Text, { color: "claude", children: formatPeakDay(stats.peakActivityDay) })
      ] }) }),
      /* @__PURE__ */ jsx(Box, { flexDirection: "column", width: 28, children: /* @__PURE__ */ jsxs(Text, { wrap: "truncate", children: [
        "Current streak:",
        " ",
        /* @__PURE__ */ jsx(Text, { color: "claude", bold: true, children: allTimeStats.streaks.currentStreak }),
        " ",
        allTimeStats.streaks.currentStreak === 1 ? "day" : "days"
      ] }) })
    ] }),
    false,
    shotStatsData && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { children: "Shot distribution" }) }),
      /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 4, children: [
        /* @__PURE__ */ jsx(Box, { flexDirection: "column", width: 28, children: /* @__PURE__ */ jsxs(Text, { wrap: "truncate", children: [
          shotStatsData.buckets[0].label,
          ":",
          " ",
          /* @__PURE__ */ jsx(Text, { color: "claude", children: shotStatsData.buckets[0].count }),
          /* @__PURE__ */ jsxs(Text, { color: "subtle", children: [
            " (",
            shotStatsData.buckets[0].pct,
            "%)"
          ] })
        ] }) }),
        /* @__PURE__ */ jsx(Box, { flexDirection: "column", width: 28, children: /* @__PURE__ */ jsxs(Text, { wrap: "truncate", children: [
          shotStatsData.buckets[1].label,
          ":",
          " ",
          /* @__PURE__ */ jsx(Text, { color: "claude", children: shotStatsData.buckets[1].count }),
          /* @__PURE__ */ jsxs(Text, { color: "subtle", children: [
            " (",
            shotStatsData.buckets[1].pct,
            "%)"
          ] })
        ] }) })
      ] }),
      /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 4, children: [
        /* @__PURE__ */ jsx(Box, { flexDirection: "column", width: 28, children: /* @__PURE__ */ jsxs(Text, { wrap: "truncate", children: [
          shotStatsData.buckets[2].label,
          ":",
          " ",
          /* @__PURE__ */ jsx(Text, { color: "claude", children: shotStatsData.buckets[2].count }),
          /* @__PURE__ */ jsxs(Text, { color: "subtle", children: [
            " (",
            shotStatsData.buckets[2].pct,
            "%)"
          ] })
        ] }) }),
        /* @__PURE__ */ jsx(Box, { flexDirection: "column", width: 28, children: /* @__PURE__ */ jsxs(Text, { wrap: "truncate", children: [
          shotStatsData.buckets[3].label,
          ":",
          " ",
          /* @__PURE__ */ jsx(Text, { color: "claude", children: shotStatsData.buckets[3].count }),
          /* @__PURE__ */ jsxs(Text, { color: "subtle", children: [
            " (",
            shotStatsData.buckets[3].pct,
            "%)"
          ] })
        ] }) })
      ] }),
      /* @__PURE__ */ jsx(Box, { flexDirection: "row", gap: 4, children: /* @__PURE__ */ jsx(Box, { flexDirection: "column", width: 28, children: /* @__PURE__ */ jsxs(Text, { wrap: "truncate", children: [
        "Avg/session:",
        " ",
        /* @__PURE__ */ jsx(Text, { color: "claude", children: shotStatsData.avgShots })
      ] }) }) })
    ] }),
    factoid && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { color: "suggestion", children: factoid }) })
  ] });
}
const BOOK_COMPARISONS = [{
  name: "The Little Prince",
  tokens: 22e3
}, {
  name: "The Old Man and the Sea",
  tokens: 35e3
}, {
  name: "A Christmas Carol",
  tokens: 37e3
}, {
  name: "Animal Farm",
  tokens: 39e3
}, {
  name: "Fahrenheit 451",
  tokens: 6e4
}, {
  name: "The Great Gatsby",
  tokens: 62e3
}, {
  name: "Slaughterhouse-Five",
  tokens: 64e3
}, {
  name: "Brave New World",
  tokens: 83e3
}, {
  name: "The Catcher in the Rye",
  tokens: 95e3
}, {
  name: "Harry Potter and the Philosopher's Stone",
  tokens: 103e3
}, {
  name: "The Hobbit",
  tokens: 123e3
}, {
  name: "1984",
  tokens: 123e3
}, {
  name: "To Kill a Mockingbird",
  tokens: 13e4
}, {
  name: "Pride and Prejudice",
  tokens: 156e3
}, {
  name: "Dune",
  tokens: 244e3
}, {
  name: "Moby-Dick",
  tokens: 268e3
}, {
  name: "Crime and Punishment",
  tokens: 274e3
}, {
  name: "A Game of Thrones",
  tokens: 381e3
}, {
  name: "Anna Karenina",
  tokens: 468e3
}, {
  name: "Don Quixote",
  tokens: 52e4
}, {
  name: "The Lord of the Rings",
  tokens: 576e3
}, {
  name: "The Count of Monte Cristo",
  tokens: 603e3
}, {
  name: "Les Mis\xE9rables",
  tokens: 689e3
}, {
  name: "War and Peace",
  tokens: 73e4
}];
const TIME_COMPARISONS = [{
  name: "a TED talk",
  minutes: 18
}, {
  name: "an episode of The Office",
  minutes: 22
}, {
  name: "listening to Abbey Road",
  minutes: 47
}, {
  name: "a yoga class",
  minutes: 60
}, {
  name: "a World Cup soccer match",
  minutes: 90
}, {
  name: "a half marathon (average time)",
  minutes: 120
}, {
  name: "the movie Inception",
  minutes: 148
}, {
  name: "watching Titanic",
  minutes: 195
}, {
  name: "a transatlantic flight",
  minutes: 420
}, {
  name: "a full night of sleep",
  minutes: 480
}];
function generateFunFactoid(stats, totalTokens) {
  const factoids = [];
  if (totalTokens > 0) {
    const matchingBooks = BOOK_COMPARISONS.filter((book) => totalTokens >= book.tokens);
    for (const book of matchingBooks) {
      const times = totalTokens / book.tokens;
      if (times >= 2) {
        factoids.push(`You've used ~${Math.floor(times)}x more tokens than ${book.name}`);
      } else {
        factoids.push(`You've used the same number of tokens as ${book.name}`);
      }
    }
  }
  if (stats.longestSession) {
    const sessionMinutes = stats.longestSession.duration / (1e3 * 60);
    for (const comparison of TIME_COMPARISONS) {
      const ratio = sessionMinutes / comparison.minutes;
      if (ratio >= 2) {
        factoids.push(`Your longest session is ~${Math.floor(ratio)}x longer than ${comparison.name}`);
      }
    }
  }
  if (factoids.length === 0) {
    return "";
  }
  const randomIndex = Math.floor(Math.random() * factoids.length);
  return factoids[randomIndex];
}
function ModelsTab(t0) {
  const $ = _c(15);
  const {
    stats,
    dateRange,
    isLoading
  } = t0;
  const {
    headerFocused,
    focusHeader
  } = useTabHeaderFocus();
  const [scrollOffset, setScrollOffset] = useState(0);
  const {
    columns: terminalWidth
  } = useTerminalSize();
  const modelEntries = Object.entries(stats.modelUsage).sort(_temp7);
  const t1 = !headerFocused;
  let t2;
  if ($[0] !== t1) {
    t2 = {
      isActive: t1
    };
    $[0] = t1;
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  useInput((_input, key) => {
    if (key.downArrow && scrollOffset < modelEntries.length - 4) {
      setScrollOffset((prev) => Math.min(prev + 2, modelEntries.length - 4));
    }
    if (key.upArrow) {
      if (scrollOffset > 0) {
        setScrollOffset(_temp8);
      } else {
        focusHeader();
      }
    }
  }, t2);
  if (modelEntries.length === 0) {
    let t32;
    if ($[2] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t32 = /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { color: "subtle", children: "No model usage data available" }) });
      $[2] = t32;
    } else {
      t32 = $[2];
    }
    return t32;
  }
  const totalTokens = modelEntries.reduce(_temp9, 0);
  const chartOutput = generateTokenChart(stats.dailyModelTokens, modelEntries.map(_temp0), terminalWidth);
  const visibleModels = modelEntries.slice(scrollOffset, scrollOffset + 4);
  const midpoint = Math.ceil(visibleModels.length / 2);
  const leftModels = visibleModels.slice(0, midpoint);
  const rightModels = visibleModels.slice(midpoint);
  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset < modelEntries.length - 4;
  const showScrollHint = modelEntries.length > 4;
  let t3;
  if ($[3] !== dateRange || $[4] !== isLoading) {
    t3 = /* @__PURE__ */ jsx(DateRangeSelector, { dateRange, isLoading });
    $[3] = dateRange;
    $[4] = isLoading;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  const T0 = Box;
  const t5 = "column";
  const t6 = 36;
  const t8 = rightModels.map((t7) => {
    const [model_1, usage_1] = t7;
    return /* @__PURE__ */ jsx(ModelEntry, { model: model_1, usage: usage_1, totalTokens }, model_1);
  });
  let t9;
  if ($[6] !== T0 || $[7] !== t8) {
    t9 = /* @__PURE__ */ jsx(T0, { flexDirection: t5, width: t6, children: t8 });
    $[6] = T0;
    $[7] = t8;
    $[8] = t9;
  } else {
    t9 = $[8];
  }
  let t10;
  if ($[9] !== canScrollDown || $[10] !== canScrollUp || $[11] !== modelEntries || $[12] !== scrollOffset || $[13] !== showScrollHint) {
    t10 = showScrollHint && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { color: "subtle", children: [
      canScrollUp ? figures.arrowUp : " ",
      " ",
      canScrollDown ? figures.arrowDown : " ",
      " ",
      scrollOffset + 1,
      "-",
      Math.min(scrollOffset + 4, modelEntries.length),
      " of",
      " ",
      modelEntries.length,
      " models (\u2191\u2193 to scroll)"
    ] }) });
    $[9] = canScrollDown;
    $[10] = canScrollUp;
    $[11] = modelEntries;
    $[12] = scrollOffset;
    $[13] = showScrollHint;
    $[14] = t10;
  } else {
    t10 = $[14];
  }
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
    chartOutput && /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [
      /* @__PURE__ */ jsx(Text, { bold: true, children: "Tokens per Day" }),
      /* @__PURE__ */ jsx(Ansi, { children: chartOutput.chart }),
      /* @__PURE__ */ jsx(Text, { color: "subtle", children: chartOutput.xAxisLabels }),
      /* @__PURE__ */ jsx(Box, { children: chartOutput.legend.map(_temp1) })
    ] }),
    t3,
    /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 4, children: [
      /* @__PURE__ */ jsx(Box, { flexDirection: "column", width: 36, children: leftModels.map((t4) => {
        const [model_0, usage_0] = t4;
        return /* @__PURE__ */ jsx(ModelEntry, { model: model_0, usage: usage_0, totalTokens }, model_0);
      }) }),
      t9
    ] }),
    t10
  ] });
}
function _temp1(item, i) {
  return /* @__PURE__ */ jsxs(Text, { children: [
    i > 0 ? " \xB7 " : "",
    /* @__PURE__ */ jsx(Ansi, { children: item.coloredBullet }),
    " ",
    item.model
  ] }, item.model);
}
function _temp0(t0) {
  const [model] = t0;
  return model;
}
function _temp9(sum, t0) {
  const [, usage] = t0;
  return sum + usage.inputTokens + usage.outputTokens;
}
function _temp8(prev_0) {
  return Math.max(prev_0 - 2, 0);
}
function _temp7(t0, t1) {
  const [, a] = t0;
  const [, b] = t1;
  return b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens);
}
function ModelEntry(t0) {
  const $ = _c(21);
  const {
    model,
    usage,
    totalTokens
  } = t0;
  const modelTokens = usage.inputTokens + usage.outputTokens;
  const t1 = modelTokens / totalTokens * 100;
  let t2;
  if ($[0] !== t1) {
    t2 = t1.toFixed(1);
    $[0] = t1;
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  const percentage = t2;
  let t3;
  if ($[2] !== model) {
    t3 = renderModelName(model);
    $[2] = model;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  let t4;
  if ($[4] !== t3) {
    t4 = /* @__PURE__ */ jsx(Text, { bold: true, children: t3 });
    $[4] = t3;
    $[5] = t4;
  } else {
    t4 = $[5];
  }
  let t5;
  if ($[6] !== percentage) {
    t5 = /* @__PURE__ */ jsxs(Text, { color: "subtle", children: [
      "(",
      percentage,
      "%)"
    ] });
    $[6] = percentage;
    $[7] = t5;
  } else {
    t5 = $[7];
  }
  let t6;
  if ($[8] !== t4 || $[9] !== t5) {
    t6 = /* @__PURE__ */ jsxs(Text, { children: [
      figures.bullet,
      " ",
      t4,
      " ",
      t5
    ] });
    $[8] = t4;
    $[9] = t5;
    $[10] = t6;
  } else {
    t6 = $[10];
  }
  let t7;
  if ($[11] !== usage.inputTokens) {
    t7 = formatNumber(usage.inputTokens);
    $[11] = usage.inputTokens;
    $[12] = t7;
  } else {
    t7 = $[12];
  }
  let t8;
  if ($[13] !== usage.outputTokens) {
    t8 = formatNumber(usage.outputTokens);
    $[13] = usage.outputTokens;
    $[14] = t8;
  } else {
    t8 = $[14];
  }
  let t9;
  if ($[15] !== t7 || $[16] !== t8) {
    t9 = /* @__PURE__ */ jsxs(Text, { color: "subtle", children: [
      "  ",
      "In: ",
      t7,
      " \xB7 Out:",
      " ",
      t8
    ] });
    $[15] = t7;
    $[16] = t8;
    $[17] = t9;
  } else {
    t9 = $[17];
  }
  let t10;
  if ($[18] !== t6 || $[19] !== t9) {
    t10 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      t6,
      t9
    ] });
    $[18] = t6;
    $[19] = t9;
    $[20] = t10;
  } else {
    t10 = $[20];
  }
  return t10;
}
function generateTokenChart(dailyTokens, models, terminalWidth) {
  if (dailyTokens.length < 2 || models.length === 0) {
    return null;
  }
  const yAxisWidth = 7;
  const availableWidth = terminalWidth - yAxisWidth;
  const chartWidth = Math.min(52, Math.max(20, availableWidth));
  let recentData;
  if (dailyTokens.length >= chartWidth) {
    recentData = dailyTokens.slice(-chartWidth);
  } else {
    const repeatCount = Math.floor(chartWidth / dailyTokens.length);
    recentData = [];
    for (const day of dailyTokens) {
      for (let i = 0; i < repeatCount; i++) {
        recentData.push(day);
      }
    }
  }
  const theme = getTheme(resolveThemeSetting(getGlobalConfig().theme));
  const colors = [themeColorToAnsi(theme.suggestion), themeColorToAnsi(theme.success), themeColorToAnsi(theme.warning)];
  const series = [];
  const legend = [];
  const topModels = models.slice(0, 3);
  for (let i = 0; i < topModels.length; i++) {
    const model = topModels[i];
    const data = recentData.map((day) => day.tokensByModel[model] || 0);
    if (data.some((v) => v > 0)) {
      series.push(data);
      const bulletColors = [theme.suggestion, theme.success, theme.warning];
      legend.push({
        model: renderModelName(model),
        coloredBullet: applyColor(figures.bullet, bulletColors[i % bulletColors.length])
      });
    }
  }
  if (series.length === 0) {
    return null;
  }
  const chart = asciichart(series, {
    height: 8,
    colors: colors.slice(0, series.length),
    format: (x) => {
      let label;
      if (x >= 1e6) {
        label = (x / 1e6).toFixed(1) + "M";
      } else if (x >= 1e3) {
        label = (x / 1e3).toFixed(0) + "k";
      } else {
        label = x.toFixed(0);
      }
      return label.padStart(6);
    }
  });
  const xAxisLabels = generateXAxisLabels(recentData, recentData.length, yAxisWidth);
  return {
    chart,
    legend,
    xAxisLabels
  };
}
function generateXAxisLabels(data, _chartWidth, yAxisOffset) {
  if (data.length === 0) return "";
  const numLabels = Math.min(4, Math.max(2, Math.floor(data.length / 8)));
  const usableLength = data.length - 6;
  const step = Math.floor(usableLength / (numLabels - 1)) || 1;
  const labelPositions = [];
  for (let i = 0; i < numLabels; i++) {
    const idx = Math.min(i * step, data.length - 1);
    const date = new Date(data[idx].date);
    const label = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    });
    labelPositions.push({
      pos: idx,
      label
    });
  }
  let result = " ".repeat(yAxisOffset);
  let currentPos = 0;
  for (const {
    pos,
    label
  } of labelPositions) {
    const spaces = Math.max(1, pos - currentPos);
    result += " ".repeat(spaces) + label;
    currentPos = pos + label.length;
  }
  return result;
}
async function handleScreenshot(stats, activeTab, setStatus) {
  setStatus("copying\u2026");
  const ansiText = renderStatsToAnsi(stats, activeTab);
  const result = await copyAnsiToClipboard(ansiText);
  setStatus(result.success ? "copied!" : "copy failed");
  setTimeout(setStatus, 2e3, null);
}
function renderStatsToAnsi(stats, activeTab) {
  const lines = [];
  if (activeTab === "Overview") {
    lines.push(...renderOverviewToAnsi(stats));
  } else {
    lines.push(...renderModelsToAnsi(stats));
  }
  while (lines.length > 0 && stripAnsi(lines[lines.length - 1]).trim() === "") {
    lines.pop();
  }
  if (lines.length > 0) {
    const lastLine = lines[lines.length - 1];
    const lastLineLen = getStringWidth(lastLine);
    const contentWidth = activeTab === "Overview" ? 70 : 80;
    const statsLabel = "/stats";
    const padding = Math.max(2, contentWidth - lastLineLen - statsLabel.length);
    lines[lines.length - 1] = lastLine + " ".repeat(padding) + chalk.gray(statsLabel);
  }
  return lines.join("\n");
}
function renderOverviewToAnsi(stats) {
  const lines = [];
  const theme = getTheme(resolveThemeSetting(getGlobalConfig().theme));
  const h = (text) => applyColor(text, theme.claude);
  const COL1_LABEL_WIDTH = 18;
  const COL2_START = 40;
  const COL2_LABEL_WIDTH = 18;
  const row = (l1, v1, l2, v2) => {
    const label1 = (l1 + ":").padEnd(COL1_LABEL_WIDTH);
    const col1PlainLen = label1.length + v1.length;
    const spaceBetween = Math.max(2, COL2_START - col1PlainLen);
    const label2 = (l2 + ":").padEnd(COL2_LABEL_WIDTH);
    return label1 + h(v1) + " ".repeat(spaceBetween) + label2 + h(v2);
  };
  if (stats.dailyActivity.length > 0) {
    lines.push(generateHeatmap(stats.dailyActivity, {
      terminalWidth: 56
    }));
    lines.push("");
  }
  const modelEntries = Object.entries(stats.modelUsage).sort(([, a], [, b]) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens));
  const favoriteModel = modelEntries[0];
  const totalTokens = modelEntries.reduce((sum, [, usage]) => sum + usage.inputTokens + usage.outputTokens, 0);
  if (favoriteModel) {
    lines.push(row("Favorite model", renderModelName(favoriteModel[0]), "Total tokens", formatNumber(totalTokens)));
  }
  lines.push("");
  lines.push(row("Sessions", formatNumber(stats.totalSessions), "Longest session", stats.longestSession ? formatDuration(stats.longestSession.duration) : "N/A"));
  const currentStreakVal = `${stats.streaks.currentStreak} ${stats.streaks.currentStreak === 1 ? "day" : "days"}`;
  const longestStreakVal = `${stats.streaks.longestStreak} ${stats.streaks.longestStreak === 1 ? "day" : "days"}`;
  lines.push(row("Current streak", currentStreakVal, "Longest streak", longestStreakVal));
  const activeDaysVal = `${stats.activeDays}/${stats.totalDays}`;
  const peakHourVal = stats.peakActivityHour !== null ? `${stats.peakActivityHour}:00-${stats.peakActivityHour + 1}:00` : "N/A";
  lines.push(row("Active days", activeDaysVal, "Peak hour", peakHourVal));
  if (false) {
    const label = "Speculation saved:".padEnd(COL1_LABEL_WIDTH);
    lines.push(label + h(formatDuration(stats.totalSpeculationTimeSavedMs)));
  }
  if (false) {
    const dist = stats.shotDistribution;
    const totalWithShots = Object.values(dist).reduce((s, n) => s + n, 0);
    if (totalWithShots > 0) {
      const totalShots = Object.entries(dist).reduce((s, [count, sessions]) => s + parseInt(count, 10) * sessions, 0);
      const avgShots = (totalShots / totalWithShots).toFixed(1);
      const bucket = (min, max) => Object.entries(dist).filter(([k]) => {
        const n = parseInt(k, 10);
        return n >= min && (max === void 0 || n <= max);
      }).reduce((s, [, v]) => s + v, 0);
      const pct = (n) => Math.round(n / totalWithShots * 100);
      const fmtBucket = (count, p) => `${count} (${p}%)`;
      const b1 = bucket(1, 1);
      const b2_5 = bucket(2, 5);
      const b6_10 = bucket(6, 10);
      const b11 = bucket(11);
      lines.push("");
      lines.push("Shot distribution");
      lines.push(row("1-shot", fmtBucket(b1, pct(b1)), "2\u20135 shot", fmtBucket(b2_5, pct(b2_5))));
      lines.push(row("6\u201310 shot", fmtBucket(b6_10, pct(b6_10)), "11+ shot", fmtBucket(b11, pct(b11))));
      lines.push(`${"Avg/session:".padEnd(COL1_LABEL_WIDTH)}${h(avgShots)}`);
    }
  }
  lines.push("");
  const factoid = generateFunFactoid(stats, totalTokens);
  lines.push(h(factoid));
  lines.push(chalk.gray(`Stats from the last ${stats.totalDays} days`));
  return lines;
}
function renderModelsToAnsi(stats) {
  const lines = [];
  const modelEntries = Object.entries(stats.modelUsage).sort(([, a], [, b]) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens));
  if (modelEntries.length === 0) {
    lines.push(chalk.gray("No model usage data available"));
    return lines;
  }
  const favoriteModel = modelEntries[0];
  const totalTokens = modelEntries.reduce((sum, [, usage]) => sum + usage.inputTokens + usage.outputTokens, 0);
  const chartOutput = generateTokenChart(
    stats.dailyModelTokens,
    modelEntries.map(([model]) => model),
    80
    // Fixed width for screenshot
  );
  if (chartOutput) {
    lines.push(chalk.bold("Tokens per Day"));
    lines.push(chartOutput.chart);
    lines.push(chalk.gray(chartOutput.xAxisLabels));
    const legendLine = chartOutput.legend.map((item) => `${item.coloredBullet} ${item.model}`).join(" \xB7 ");
    lines.push(legendLine);
    lines.push("");
  }
  lines.push(`${figures.star} Favorite: ${chalk.magenta.bold(renderModelName(favoriteModel?.[0] || ""))} \xB7 ${figures.circle} Total: ${chalk.magenta(formatNumber(totalTokens))} tokens`);
  lines.push("");
  const topModels = modelEntries.slice(0, 3);
  for (const [model, usage] of topModels) {
    const modelTokens = usage.inputTokens + usage.outputTokens;
    const percentage = (modelTokens / totalTokens * 100).toFixed(1);
    lines.push(`${figures.bullet} ${chalk.bold(renderModelName(model))} ${chalk.gray(`(${percentage}%)`)}`);
    lines.push(chalk.dim(`  In: ${formatNumber(usage.inputTokens)} \xB7 Out: ${formatNumber(usage.outputTokens)}`));
  }
  return lines;
}
export {
  Stats
};
