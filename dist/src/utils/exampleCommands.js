import memoize from "lodash-es/memoize.js";
import sample from "lodash-es/sample.js";
import { getCwd } from "../utils/cwd.js";
import { getCurrentProjectConfig, saveCurrentProjectConfig } from "./config.js";
import { env } from "./env.js";
import { execFileNoThrowWithCwd } from "./execFileNoThrow.js";
import { getIsGit, gitExe } from "./git.js";
import { logError } from "./log.js";
import { getGitEmail } from "./user.js";
const NON_CORE_PATTERNS = [
  // lock / dependency manifests
  /(?:^|\/)(?:package-lock\.json|yarn\.lock|bun\.lock|bun\.lockb|pnpm-lock\.yaml|Pipfile\.lock|poetry\.lock|Cargo\.lock|Gemfile\.lock|go\.sum|composer\.lock|uv\.lock)$/,
  // generated / build artifacts
  /\.generated\./,
  /(?:^|\/)(?:dist|build|out|target|node_modules|\.next|__pycache__)\//,
  /\.(?:min\.js|min\.css|map|pyc|pyo)$/,
  // data / docs / config extensions (not "write a test for" material)
  /\.(?:json|ya?ml|toml|xml|ini|cfg|conf|env|lock|txt|md|mdx|rst|csv|log|svg)$/i,
  // configuration / metadata
  /(?:^|\/)\.?(?:eslintrc|prettierrc|babelrc|editorconfig|gitignore|gitattributes|dockerignore|npmrc)/,
  /(?:^|\/)(?:tsconfig|jsconfig|biome|vitest\.config|jest\.config|webpack\.config|vite\.config|rollup\.config)\.[a-z]+$/,
  /(?:^|\/)\.(?:github|vscode|idea|claude)\//,
  // docs / changelogs (not "how does X work" material)
  /(?:^|\/)(?:CHANGELOG|LICENSE|CONTRIBUTING|CODEOWNERS|README)(?:\.[a-z]+)?$/i
];
function isCoreFile(path) {
  return !NON_CORE_PATTERNS.some((p) => p.test(path));
}
function countAndSortItems(items, topN = 20) {
  const counts = /* @__PURE__ */ new Map();
  for (const item of items) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, topN).map(([item, count]) => `${count.toString().padStart(6)} ${item}`).join("\n");
}
function pickDiverseCoreFiles(sortedPaths, want) {
  const picked = [];
  const seenBasenames = /* @__PURE__ */ new Set();
  const dirTally = /* @__PURE__ */ new Map();
  for (let cap = 1; picked.length < want && cap <= want; cap++) {
    for (const p of sortedPaths) {
      if (picked.length >= want) break;
      if (!isCoreFile(p)) continue;
      const lastSep = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
      const base = lastSep >= 0 ? p.slice(lastSep + 1) : p;
      if (!base || seenBasenames.has(base)) continue;
      const dir = lastSep >= 0 ? p.slice(0, lastSep) : ".";
      if ((dirTally.get(dir) ?? 0) >= cap) continue;
      picked.push(base);
      seenBasenames.add(base);
      dirTally.set(dir, (dirTally.get(dir) ?? 0) + 1);
    }
  }
  return picked.length >= want ? picked : [];
}
async function getFrequentlyModifiedFiles() {
  if (process.env.NODE_ENV === "test") return [];
  if (env.platform === "win32") return [];
  if (!await getIsGit()) return [];
  try {
    const userEmail = await getGitEmail();
    const logArgs = [
      "log",
      "-n",
      "1000",
      "--pretty=format:",
      "--name-only",
      "--diff-filter=M"
    ];
    const counts = /* @__PURE__ */ new Map();
    const tallyInto = (stdout) => {
      for (const line of stdout.split("\n")) {
        const f = line.trim();
        if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
      }
    };
    if (userEmail) {
      const { stdout } = await execFileNoThrowWithCwd(
        "git",
        [...logArgs, `--author=${userEmail}`],
        { cwd: getCwd() }
      );
      tallyInto(stdout);
    }
    if (counts.size < 10) {
      const { stdout } = await execFileNoThrowWithCwd(gitExe(), logArgs, {
        cwd: getCwd()
      });
      tallyInto(stdout);
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([p]) => p);
    return pickDiverseCoreFiles(sorted, 5);
  } catch (err) {
    logError(err);
    return [];
  }
}
const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1e3;
const getExampleCommandFromCache = memoize(() => {
  const projectConfig = getCurrentProjectConfig();
  const frequentFile = projectConfig.exampleFiles?.length ? sample(projectConfig.exampleFiles) : "<filepath>";
  const commands = [
    "fix lint errors",
    "fix typecheck errors",
    `how does ${frequentFile} work?`,
    `refactor ${frequentFile}`,
    "how do I log an error?",
    `edit ${frequentFile} to...`,
    `write a test for ${frequentFile}`,
    "create a util logging.py that..."
  ];
  return `Try "${sample(commands)}"`;
});
const refreshExampleCommands = memoize(async () => {
  const projectConfig = getCurrentProjectConfig();
  const now = Date.now();
  const lastGenerated = projectConfig.exampleFilesGeneratedAt ?? 0;
  if (now - lastGenerated > ONE_WEEK_IN_MS) {
    projectConfig.exampleFiles = [];
  }
  if (!projectConfig.exampleFiles?.length) {
    void getFrequentlyModifiedFiles().then((files) => {
      if (files.length) {
        saveCurrentProjectConfig((current) => ({
          ...current,
          exampleFiles: files,
          exampleFilesGeneratedAt: Date.now()
        }));
      }
    });
  }
});
export {
  countAndSortItems,
  getExampleCommandFromCache,
  pickDiverseCoreFiles,
  refreshExampleCommands
};
