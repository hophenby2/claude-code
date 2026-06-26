import { readdir } from "fs/promises";
import { basename, join } from "path";
import { parseFrontmatter } from "../utils/frontmatterParser.js";
import { readFileInRange } from "../utils/readFileInRange.js";
import { parseMemoryType } from "./memoryTypes.js";
const MAX_MEMORY_FILES = 200;
const FRONTMATTER_MAX_LINES = 30;
async function scanMemoryFiles(memoryDir, signal) {
  try {
    const entries = await readdir(memoryDir, { recursive: true });
    const mdFiles = entries.filter(
      (f) => f.endsWith(".md") && basename(f) !== "MEMORY.md"
    );
    const headerResults = await Promise.allSettled(
      mdFiles.map(async (relativePath) => {
        const filePath = join(memoryDir, relativePath);
        const { content, mtimeMs } = await readFileInRange(
          filePath,
          0,
          FRONTMATTER_MAX_LINES,
          void 0,
          signal
        );
        const { frontmatter } = parseFrontmatter(content, filePath);
        return {
          filename: relativePath,
          filePath,
          mtimeMs,
          description: frontmatter.description || null,
          type: parseMemoryType(frontmatter.type)
        };
      })
    );
    return headerResults.filter(
      (r) => r.status === "fulfilled"
    ).map((r) => r.value).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, MAX_MEMORY_FILES);
  } catch {
    return [];
  }
}
function formatMemoryManifest(memories) {
  return memories.map((m) => {
    const tag = m.type ? `[${m.type}] ` : "";
    const ts = new Date(m.mtimeMs).toISOString();
    return m.description ? `- ${tag}${m.filename} (${ts}): ${m.description}` : `- ${tag}${m.filename} (${ts})`;
  }).join("\n");
}
export {
  formatMemoryManifest,
  scanMemoryFiles
};
