import { unwatchFile, watchFile } from "fs";
import { readdir, readFile, stat } from "fs/promises";
import { join, resolve } from "path";
import { waitForScrollIdle } from "../../bootstrap/state.js";
import { registerCleanup } from "../cleanupRegistry.js";
import { getCwd } from "../cwd.js";
import { findGitRoot } from "../git.js";
import { parseGitConfigValue } from "./gitConfigParser.js";
const resolveGitDirCache = /* @__PURE__ */ new Map();
function clearResolveGitDirCache() {
  resolveGitDirCache.clear();
}
async function resolveGitDir(startPath) {
  const cwd = resolve(startPath ?? getCwd());
  const cached = resolveGitDirCache.get(cwd);
  if (cached !== void 0) {
    return cached;
  }
  const root = findGitRoot(cwd);
  if (!root) {
    resolveGitDirCache.set(cwd, null);
    return null;
  }
  const gitPath = join(root, ".git");
  try {
    const st = await stat(gitPath);
    if (st.isFile()) {
      const content = (await readFile(gitPath, "utf-8")).trim();
      if (content.startsWith("gitdir:")) {
        const rawDir = content.slice("gitdir:".length).trim();
        const resolved = resolve(root, rawDir);
        resolveGitDirCache.set(cwd, resolved);
        return resolved;
      }
    }
    resolveGitDirCache.set(cwd, gitPath);
    return gitPath;
  } catch {
    resolveGitDirCache.set(cwd, null);
    return null;
  }
}
function isSafeRefName(name) {
  if (!name || name.startsWith("-") || name.startsWith("/")) {
    return false;
  }
  if (name.includes("..")) {
    return false;
  }
  if (name.split("/").some((c) => c === "." || c === "")) {
    return false;
  }
  if (!/^[a-zA-Z0-9/._+@-]+$/.test(name)) {
    return false;
  }
  return true;
}
function isValidGitSha(s) {
  return /^[0-9a-f]{40}$/.test(s) || /^[0-9a-f]{64}$/.test(s);
}
async function readGitHead(gitDir) {
  try {
    const content = (await readFile(join(gitDir, "HEAD"), "utf-8")).trim();
    if (content.startsWith("ref:")) {
      const ref = content.slice("ref:".length).trim();
      if (ref.startsWith("refs/heads/")) {
        const name = ref.slice("refs/heads/".length);
        if (!isSafeRefName(name)) {
          return null;
        }
        return { type: "branch", name };
      }
      if (!isSafeRefName(ref)) {
        return null;
      }
      const sha = await resolveRef(gitDir, ref);
      return sha ? { type: "detached", sha } : { type: "detached", sha: "" };
    }
    if (!isValidGitSha(content)) {
      return null;
    }
    return { type: "detached", sha: content };
  } catch {
    return null;
  }
}
async function resolveRef(gitDir, ref) {
  const result = await resolveRefInDir(gitDir, ref);
  if (result) {
    return result;
  }
  const commonDir = await getCommonDir(gitDir);
  if (commonDir && commonDir !== gitDir) {
    return resolveRefInDir(commonDir, ref);
  }
  return null;
}
async function resolveRefInDir(dir, ref) {
  try {
    const content = (await readFile(join(dir, ref), "utf-8")).trim();
    if (content.startsWith("ref:")) {
      const target = content.slice("ref:".length).trim();
      if (!isSafeRefName(target)) {
        return null;
      }
      return resolveRef(dir, target);
    }
    if (!isValidGitSha(content)) {
      return null;
    }
    return content;
  } catch {
  }
  try {
    const packed = await readFile(join(dir, "packed-refs"), "utf-8");
    for (const line of packed.split("\n")) {
      if (line.startsWith("#") || line.startsWith("^")) {
        continue;
      }
      const spaceIdx = line.indexOf(" ");
      if (spaceIdx === -1) {
        continue;
      }
      if (line.slice(spaceIdx + 1) === ref) {
        const sha = line.slice(0, spaceIdx);
        return isValidGitSha(sha) ? sha : null;
      }
    }
  } catch {
  }
  return null;
}
async function getCommonDir(gitDir) {
  try {
    const content = (await readFile(join(gitDir, "commondir"), "utf-8")).trim();
    return resolve(gitDir, content);
  } catch {
    return null;
  }
}
async function readRawSymref(gitDir, refPath, branchPrefix) {
  try {
    const content = (await readFile(join(gitDir, refPath), "utf-8")).trim();
    if (content.startsWith("ref:")) {
      const target = content.slice("ref:".length).trim();
      if (target.startsWith(branchPrefix)) {
        const name = target.slice(branchPrefix.length);
        if (!isSafeRefName(name)) {
          return null;
        }
        return name;
      }
    }
  } catch {
  }
  return null;
}
const WATCH_INTERVAL_MS = process.env.NODE_ENV === "test" ? 10 : 1e3;
class GitFileWatcher {
  gitDir = null;
  commonDir = null;
  initialized = false;
  initPromise = null;
  watchedPaths = [];
  branchRefPath = null;
  cache = /* @__PURE__ */ new Map();
  async ensureStarted() {
    if (this.initialized) {
      return;
    }
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = this.start();
    return this.initPromise;
  }
  async start() {
    this.gitDir = await resolveGitDir();
    this.initialized = true;
    if (!this.gitDir) {
      return;
    }
    this.commonDir = await getCommonDir(this.gitDir);
    this.watchPath(join(this.gitDir, "HEAD"), () => {
      void this.onHeadChanged();
    });
    this.watchPath(join(this.commonDir ?? this.gitDir, "config"), () => {
      this.invalidate();
    });
    await this.watchCurrentBranchRef();
    registerCleanup(async () => {
      this.stopWatching();
    });
  }
  watchPath(path, callback) {
    this.watchedPaths.push(path);
    watchFile(path, { interval: WATCH_INTERVAL_MS }, callback);
  }
  /**
   * Watch the loose ref file for the current branch.
   * Called on startup and whenever HEAD changes (branch switch).
   */
  async watchCurrentBranchRef() {
    if (!this.gitDir) {
      return;
    }
    const head = await readGitHead(this.gitDir);
    const refsDir = this.commonDir ?? this.gitDir;
    const refPath = head?.type === "branch" ? join(refsDir, "refs", "heads", head.name) : null;
    if (refPath === this.branchRefPath) {
      return;
    }
    if (this.branchRefPath) {
      unwatchFile(this.branchRefPath);
      this.watchedPaths = this.watchedPaths.filter(
        (p) => p !== this.branchRefPath
      );
    }
    this.branchRefPath = refPath;
    if (!refPath) {
      return;
    }
    this.watchPath(refPath, () => {
      this.invalidate();
    });
  }
  async onHeadChanged() {
    this.invalidate();
    await waitForScrollIdle();
    await this.watchCurrentBranchRef();
  }
  invalidate() {
    for (const entry of this.cache.values()) {
      entry.dirty = true;
    }
  }
  stopWatching() {
    for (const path of this.watchedPaths) {
      unwatchFile(path);
    }
    this.watchedPaths = [];
    this.branchRefPath = null;
  }
  /**
   * Get a cached value by key. On first call for a key, computes and caches it.
   * Subsequent calls return the cached value until a watched file changes,
   * which marks the entry dirty. The next get() re-computes from disk.
   *
   * Race condition handling: dirty is cleared BEFORE the async compute starts.
   * If a file change arrives during compute, it re-sets dirty, so the next
   * get() will re-read again rather than serving a stale value.
   */
  async get(key, compute) {
    await this.ensureStarted();
    const existing = this.cache.get(key);
    if (existing && !existing.dirty) {
      return existing.value;
    }
    if (existing) {
      existing.dirty = false;
    }
    const value = await compute();
    const entry = this.cache.get(key);
    if (entry && !entry.dirty) {
      entry.value = value;
    }
    if (!entry) {
      this.cache.set(key, { value, dirty: false, compute });
    }
    return value;
  }
  /** Reset all state. Stops file watchers. For testing only. */
  reset() {
    this.stopWatching();
    this.cache.clear();
    this.initialized = false;
    this.initPromise = null;
    this.gitDir = null;
    this.commonDir = null;
  }
}
const gitWatcher = new GitFileWatcher();
async function computeBranch() {
  const gitDir = await resolveGitDir();
  if (!gitDir) {
    return "HEAD";
  }
  const head = await readGitHead(gitDir);
  if (!head) {
    return "HEAD";
  }
  return head.type === "branch" ? head.name : "HEAD";
}
async function computeHead() {
  const gitDir = await resolveGitDir();
  if (!gitDir) {
    return "";
  }
  const head = await readGitHead(gitDir);
  if (!head) {
    return "";
  }
  if (head.type === "branch") {
    return await resolveRef(gitDir, `refs/heads/${head.name}`) ?? "";
  }
  return head.sha;
}
async function computeRemoteUrl() {
  const gitDir = await resolveGitDir();
  if (!gitDir) {
    return null;
  }
  const url = await parseGitConfigValue(gitDir, "remote", "origin", "url");
  if (url) {
    return url;
  }
  const commonDir = await getCommonDir(gitDir);
  if (commonDir && commonDir !== gitDir) {
    return parseGitConfigValue(commonDir, "remote", "origin", "url");
  }
  return null;
}
async function computeDefaultBranch() {
  const gitDir = await resolveGitDir();
  if (!gitDir) {
    return "main";
  }
  const commonDir = await getCommonDir(gitDir) ?? gitDir;
  const branchFromSymref = await readRawSymref(
    commonDir,
    "refs/remotes/origin/HEAD",
    "refs/remotes/origin/"
  );
  if (branchFromSymref) {
    return branchFromSymref;
  }
  for (const candidate of ["main", "master"]) {
    const sha = await resolveRef(commonDir, `refs/remotes/origin/${candidate}`);
    if (sha) {
      return candidate;
    }
  }
  return "main";
}
function getCachedBranch() {
  return gitWatcher.get("branch", computeBranch);
}
function getCachedHead() {
  return gitWatcher.get("head", computeHead);
}
function getCachedRemoteUrl() {
  return gitWatcher.get("remoteUrl", computeRemoteUrl);
}
function getCachedDefaultBranch() {
  return gitWatcher.get("defaultBranch", computeDefaultBranch);
}
function resetGitFileWatcher() {
  gitWatcher.reset();
}
async function getHeadForDir(cwd) {
  const gitDir = await resolveGitDir(cwd);
  if (!gitDir) {
    return null;
  }
  const head = await readGitHead(gitDir);
  if (!head) {
    return null;
  }
  if (head.type === "branch") {
    return resolveRef(gitDir, `refs/heads/${head.name}`);
  }
  return head.sha;
}
async function readWorktreeHeadSha(worktreePath) {
  let gitDir;
  try {
    const ptr = (await readFile(join(worktreePath, ".git"), "utf-8")).trim();
    if (!ptr.startsWith("gitdir:")) {
      return null;
    }
    gitDir = resolve(worktreePath, ptr.slice("gitdir:".length).trim());
  } catch {
    return null;
  }
  const head = await readGitHead(gitDir);
  if (!head) {
    return null;
  }
  if (head.type === "branch") {
    return resolveRef(gitDir, `refs/heads/${head.name}`);
  }
  return head.sha;
}
async function getRemoteUrlForDir(cwd) {
  const gitDir = await resolveGitDir(cwd);
  if (!gitDir) {
    return null;
  }
  const url = await parseGitConfigValue(gitDir, "remote", "origin", "url");
  if (url) {
    return url;
  }
  const commonDir = await getCommonDir(gitDir);
  if (commonDir && commonDir !== gitDir) {
    return parseGitConfigValue(commonDir, "remote", "origin", "url");
  }
  return null;
}
async function isShallowClone() {
  const gitDir = await resolveGitDir();
  if (!gitDir) {
    return false;
  }
  const commonDir = await getCommonDir(gitDir) ?? gitDir;
  try {
    await stat(join(commonDir, "shallow"));
    return true;
  } catch {
    return false;
  }
}
async function getWorktreeCountFromFs() {
  try {
    const gitDir = await resolveGitDir();
    if (!gitDir) {
      return 0;
    }
    const commonDir = await getCommonDir(gitDir) ?? gitDir;
    const entries = await readdir(join(commonDir, "worktrees"));
    return entries.length + 1;
  } catch {
    return 1;
  }
}
export {
  clearResolveGitDirCache,
  getCachedBranch,
  getCachedDefaultBranch,
  getCachedHead,
  getCachedRemoteUrl,
  getCommonDir,
  getHeadForDir,
  getRemoteUrlForDir,
  getWorktreeCountFromFs,
  isSafeRefName,
  isShallowClone,
  isValidGitSha,
  readGitHead,
  readRawSymref,
  readWorktreeHeadSha,
  resetGitFileWatcher,
  resolveGitDir,
  resolveRef
};
