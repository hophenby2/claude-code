import { stat, unlink } from "fs/promises";
import {
  logEvent
} from "../../services/analytics/index.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../../services/analytics/growthbook.js";
import { uploadFile } from "../../services/api/filesApi.js";
import { getCwd } from "../cwd.js";
import { logForDebugging } from "../debug.js";
import { execFileNoThrowWithCwd } from "../execFileNoThrow.js";
import { findGitRoot, gitExe } from "../git.js";
import { generateTempFilePath } from "../tempfile.js";
const DEFAULT_BUNDLE_MAX_BYTES = 100 * 1024 * 1024;
async function _bundleWithFallback(gitRoot, bundlePath, maxBytes, hasStash, signal) {
  const extra = hasStash ? ["refs/seed/stash"] : [];
  const mkBundle = (base) => execFileNoThrowWithCwd(
    gitExe(),
    ["bundle", "create", bundlePath, base, ...extra],
    { cwd: gitRoot, abortSignal: signal }
  );
  const allResult = await mkBundle("--all");
  if (allResult.code !== 0) {
    return {
      ok: false,
      error: `git bundle create --all failed (${allResult.code}): ${allResult.stderr.slice(0, 200)}`,
      failReason: "git_error"
    };
  }
  const { size: allSize } = await stat(bundlePath);
  if (allSize <= maxBytes) {
    return { ok: true, size: allSize, scope: "all" };
  }
  logForDebugging(
    `[gitBundle] --all bundle is ${(allSize / 1024 / 1024).toFixed(1)}MB (> ${(maxBytes / 1024 / 1024).toFixed(0)}MB), retrying HEAD-only`
  );
  const headResult = await mkBundle("HEAD");
  if (headResult.code !== 0) {
    return {
      ok: false,
      error: `git bundle create HEAD failed (${headResult.code}): ${headResult.stderr.slice(0, 200)}`,
      failReason: "git_error"
    };
  }
  const { size: headSize } = await stat(bundlePath);
  if (headSize <= maxBytes) {
    return { ok: true, size: headSize, scope: "head" };
  }
  logForDebugging(
    `[gitBundle] HEAD bundle is ${(headSize / 1024 / 1024).toFixed(1)}MB, retrying squashed-root`
  );
  const treeRef = hasStash ? "refs/seed/stash^{tree}" : "HEAD^{tree}";
  const commitTree = await execFileNoThrowWithCwd(
    gitExe(),
    ["commit-tree", treeRef, "-m", "seed"],
    { cwd: gitRoot, abortSignal: signal }
  );
  if (commitTree.code !== 0) {
    return {
      ok: false,
      error: `git commit-tree failed (${commitTree.code}): ${commitTree.stderr.slice(0, 200)}`,
      failReason: "git_error"
    };
  }
  const squashedSha = commitTree.stdout.trim();
  await execFileNoThrowWithCwd(
    gitExe(),
    ["update-ref", "refs/seed/root", squashedSha],
    { cwd: gitRoot }
  );
  const squashResult = await execFileNoThrowWithCwd(
    gitExe(),
    ["bundle", "create", bundlePath, "refs/seed/root"],
    { cwd: gitRoot, abortSignal: signal }
  );
  if (squashResult.code !== 0) {
    return {
      ok: false,
      error: `git bundle create refs/seed/root failed (${squashResult.code}): ${squashResult.stderr.slice(0, 200)}`,
      failReason: "git_error"
    };
  }
  const { size: squashSize } = await stat(bundlePath);
  if (squashSize <= maxBytes) {
    return { ok: true, size: squashSize, scope: "squashed" };
  }
  return {
    ok: false,
    error: "Repo is too large to bundle. Please setup GitHub on https://claude.ai/code",
    failReason: "too_large"
  };
}
async function createAndUploadGitBundle(config, opts) {
  const workdir = opts?.cwd ?? getCwd();
  const gitRoot = findGitRoot(workdir);
  if (!gitRoot) {
    return { success: false, error: "Not in a git repository" };
  }
  for (const ref of ["refs/seed/stash", "refs/seed/root"]) {
    await execFileNoThrowWithCwd(gitExe(), ["update-ref", "-d", ref], {
      cwd: gitRoot
    });
  }
  const refCheck = await execFileNoThrowWithCwd(
    gitExe(),
    ["for-each-ref", "--count=1", "refs/"],
    { cwd: gitRoot }
  );
  if (refCheck.code === 0 && refCheck.stdout.trim() === "") {
    logEvent("tengu_ccr_bundle_upload", {
      outcome: "empty_repo"
    });
    return {
      success: false,
      error: "Repository has no commits yet",
      failReason: "empty_repo"
    };
  }
  const stashResult = await execFileNoThrowWithCwd(
    gitExe(),
    ["stash", "create"],
    { cwd: gitRoot, abortSignal: opts?.signal }
  );
  const wipStashSha = stashResult.code === 0 ? stashResult.stdout.trim() : "";
  const hasWip = wipStashSha !== "";
  if (stashResult.code !== 0) {
    logForDebugging(
      `[gitBundle] git stash create failed (${stashResult.code}), proceeding without WIP: ${stashResult.stderr.slice(0, 200)}`
    );
  } else if (hasWip) {
    logForDebugging(`[gitBundle] Captured WIP as stash ${wipStashSha}`);
    await execFileNoThrowWithCwd(
      gitExe(),
      ["update-ref", "refs/seed/stash", wipStashSha],
      { cwd: gitRoot }
    );
  }
  const bundlePath = generateTempFilePath("ccr-seed", ".bundle");
  try {
    const maxBytes = getFeatureValue_CACHED_MAY_BE_STALE(
      "tengu_ccr_bundle_max_bytes",
      null
    ) ?? DEFAULT_BUNDLE_MAX_BYTES;
    const bundle = await _bundleWithFallback(
      gitRoot,
      bundlePath,
      maxBytes,
      hasWip,
      opts?.signal
    );
    if (!bundle.ok) {
      logForDebugging(`[gitBundle] ${bundle.error}`);
      logEvent("tengu_ccr_bundle_upload", {
        outcome: bundle.failReason,
        max_bytes: maxBytes
      });
      return {
        success: false,
        error: bundle.error,
        failReason: bundle.failReason
      };
    }
    const upload = await uploadFile(bundlePath, "_source_seed.bundle", config, {
      signal: opts?.signal
    });
    if (!upload.success) {
      logEvent("tengu_ccr_bundle_upload", {
        outcome: "failed"
      });
      return { success: false, error: upload.error };
    }
    logForDebugging(
      `[gitBundle] Uploaded ${upload.size} bytes as file_id ${upload.fileId}`
    );
    logEvent("tengu_ccr_bundle_upload", {
      outcome: "success",
      size_bytes: upload.size,
      scope: bundle.scope,
      has_wip: hasWip
    });
    return {
      success: true,
      fileId: upload.fileId,
      bundleSizeBytes: upload.size,
      scope: bundle.scope,
      hasWip
    };
  } finally {
    try {
      await unlink(bundlePath);
    } catch {
      logForDebugging(`[gitBundle] Could not delete ${bundlePath} (non-fatal)`);
    }
    for (const ref of ["refs/seed/stash", "refs/seed/root"]) {
      await execFileNoThrowWithCwd(gitExe(), ["update-ref", "-d", ref], {
        cwd: gitRoot
      });
    }
  }
}
export {
  createAndUploadGitBundle
};
