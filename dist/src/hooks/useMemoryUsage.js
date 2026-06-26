import { useState } from "react";
import { useInterval } from "usehooks-ts";
const HIGH_MEMORY_THRESHOLD = 1.5 * 1024 * 1024 * 1024;
const CRITICAL_MEMORY_THRESHOLD = 2.5 * 1024 * 1024 * 1024;
function useMemoryUsage() {
  const [memoryUsage, setMemoryUsage] = useState(null);
  useInterval(() => {
    const heapUsed = process.memoryUsage().heapUsed;
    const status = heapUsed >= CRITICAL_MEMORY_THRESHOLD ? "critical" : heapUsed >= HIGH_MEMORY_THRESHOLD ? "high" : "normal";
    setMemoryUsage((prev) => {
      if (status === "normal") return prev === null ? prev : null;
      return { heapUsed, status };
    });
  }, 1e4);
  return memoryUsage;
}
export {
  useMemoryUsage
};
