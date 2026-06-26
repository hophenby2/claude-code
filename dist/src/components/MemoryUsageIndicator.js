import { jsx, jsxs } from "react/jsx-runtime";
import { useMemoryUsage } from "../hooks/useMemoryUsage.js";
import { Box, Text } from "../ink.js";
import { formatFileSize } from "../utils/format.js";
function MemoryUsageIndicator() {
  if (true) {
    return null;
  }
  const memoryUsage = useMemoryUsage();
  if (!memoryUsage) {
    return null;
  }
  const {
    heapUsed,
    status
  } = memoryUsage;
  if (status === "normal") {
    return null;
  }
  const formattedSize = formatFileSize(heapUsed);
  const color = status === "critical" ? "error" : "warning";
  return /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(Text, { color, wrap: "truncate", children: [
    "High memory usage (",
    formattedSize,
    ") \xB7 /heapdump"
  ] }) });
}
export {
  MemoryUsageIndicator
};
