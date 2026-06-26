import { homedir } from "os";
import { logForDebugging } from "../debug.js";
import {
  filterExistingPaths,
  getKnownPathsForRepo
} from "../githubRepoPathMapping.js";
import { jsonStringify } from "../slowOperations.js";
import { readLastFetchTime } from "./banner.js";
import { parseDeepLink } from "./parseDeepLink.js";
import { MACOS_BUNDLE_ID } from "./registerProtocol.js";
import { launchInTerminal } from "./terminalLauncher.js";
async function handleDeepLinkUri(uri) {
  logForDebugging(`Handling deep link URI: ${uri}`);
  let action;
  try {
    action = parseDeepLink(uri);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Deep link error: ${message}`);
    return 1;
  }
  logForDebugging(`Parsed deep link action: ${jsonStringify(action)}`);
  const { cwd, resolvedRepo } = await resolveCwd(action);
  const lastFetch = resolvedRepo ? await readLastFetchTime(cwd) : void 0;
  const launched = await launchInTerminal(process.execPath, {
    query: action.query,
    cwd,
    repo: resolvedRepo,
    lastFetchMs: lastFetch?.getTime()
  });
  if (!launched) {
    console.error(
      "Failed to open a terminal. Make sure a supported terminal emulator is installed."
    );
    return 1;
  }
  return 0;
}
async function handleUrlSchemeLaunch() {
  if (process.env.__CFBundleIdentifier !== MACOS_BUNDLE_ID) {
    return null;
  }
  try {
    const { waitForUrlEvent } = await import("url-handler-napi");
    const url = waitForUrlEvent(5e3);
    if (!url) {
      return null;
    }
    return await handleDeepLinkUri(url);
  } catch {
    return null;
  }
}
async function resolveCwd(action) {
  if (action.cwd) {
    return { cwd: action.cwd };
  }
  if (action.repo) {
    const known = getKnownPathsForRepo(action.repo);
    const existing = await filterExistingPaths(known);
    if (existing[0]) {
      logForDebugging(`Resolved repo ${action.repo} \u2192 ${existing[0]}`);
      return { cwd: existing[0], resolvedRepo: action.repo };
    }
    logForDebugging(
      `No local clone found for repo ${action.repo}, falling back to home`
    );
  }
  return { cwd: homedir() };
}
export {
  handleDeepLinkUri,
  handleUrlSchemeLaunch
};
