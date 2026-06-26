import { useEffect, useMemo, useState } from "react";
import {
  fetchGitDiff,
  fetchGitDiffHunks
} from "../utils/gitDiff.js";
const MAX_LINES_PER_FILE = 400;
function useDiffData() {
  const [diffResult, setDiffResult] = useState(null);
  const [hunks, setHunks] = useState(
    /* @__PURE__ */ new Map()
  );
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function loadDiffData() {
      try {
        const [statsResult, hunksResult] = await Promise.all([
          fetchGitDiff(),
          fetchGitDiffHunks()
        ]);
        if (!cancelled) {
          setDiffResult(statsResult);
          setHunks(hunksResult);
          setLoading(false);
        }
      } catch (_error) {
        if (!cancelled) {
          setDiffResult(null);
          setHunks(/* @__PURE__ */ new Map());
          setLoading(false);
        }
      }
    }
    void loadDiffData();
    return () => {
      cancelled = true;
    };
  }, []);
  return useMemo(() => {
    if (!diffResult) {
      return { stats: null, files: [], hunks: /* @__PURE__ */ new Map(), loading };
    }
    const { stats, perFileStats } = diffResult;
    const files = [];
    for (const [path, fileStats] of perFileStats) {
      const fileHunks = hunks.get(path);
      const isUntracked = fileStats.isUntracked ?? false;
      const isLargeFile = !fileStats.isBinary && !isUntracked && !fileHunks;
      const totalLines = fileStats.added + fileStats.removed;
      const isTruncated = !isLargeFile && !fileStats.isBinary && totalLines > MAX_LINES_PER_FILE;
      files.push({
        path,
        linesAdded: fileStats.added,
        linesRemoved: fileStats.removed,
        isBinary: fileStats.isBinary,
        isLargeFile,
        isTruncated,
        isUntracked
      });
    }
    files.sort((a, b) => a.path.localeCompare(b.path));
    return { stats, files, hunks, loading: false };
  }, [diffResult, hunks, loading]);
}
export {
  useDiffData
};
