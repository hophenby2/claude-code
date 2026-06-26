import { readdir, readFile } from "fs/promises";
import memoize from "lodash-es/memoize.js";
import { release as osRelease } from "os";
import { getFsImplementation } from "./fsOperations.js";
import { logError } from "./log.js";
const SUPPORTED_PLATFORMS = ["macos", "wsl"];
const getPlatform = memoize(() => {
  try {
    if (process.platform === "darwin") {
      return "macos";
    }
    if (process.platform === "win32") {
      return "windows";
    }
    if (process.platform === "linux") {
      try {
        const procVersion = getFsImplementation().readFileSync(
          "/proc/version",
          { encoding: "utf8" }
        );
        if (procVersion.toLowerCase().includes("microsoft") || procVersion.toLowerCase().includes("wsl")) {
          return "wsl";
        }
      } catch (error) {
        logError(error);
      }
      return "linux";
    }
    return "unknown";
  } catch (error) {
    logError(error);
    return "unknown";
  }
});
const getWslVersion = memoize(() => {
  if (process.platform !== "linux") {
    return void 0;
  }
  try {
    const procVersion = getFsImplementation().readFileSync("/proc/version", {
      encoding: "utf8"
    });
    const wslVersionMatch = procVersion.match(/WSL(\d+)/i);
    if (wslVersionMatch && wslVersionMatch[1]) {
      return wslVersionMatch[1];
    }
    if (procVersion.toLowerCase().includes("microsoft")) {
      return "1";
    }
    return void 0;
  } catch (error) {
    logError(error);
    return void 0;
  }
});
const getLinuxDistroInfo = memoize(
  async () => {
    if (process.platform !== "linux") {
      return void 0;
    }
    const result = {
      linuxKernel: osRelease()
    };
    try {
      const content = await readFile("/etc/os-release", "utf8");
      for (const line of content.split("\n")) {
        const match = line.match(/^(ID|VERSION_ID)=(.*)$/);
        if (match && match[1] && match[2]) {
          const value = match[2].replace(/^"|"$/g, "");
          if (match[1] === "ID") {
            result.linuxDistroId = value;
          } else {
            result.linuxDistroVersion = value;
          }
        }
      }
    } catch {
    }
    return result;
  }
);
const VCS_MARKERS = [
  [".git", "git"],
  [".hg", "mercurial"],
  [".svn", "svn"],
  [".p4config", "perforce"],
  ["$tf", "tfs"],
  [".tfvc", "tfs"],
  [".jj", "jujutsu"],
  [".sl", "sapling"]
];
async function detectVcs(dir) {
  const detected = /* @__PURE__ */ new Set();
  if (process.env.P4PORT) {
    detected.add("perforce");
  }
  try {
    const targetDir = dir ?? getFsImplementation().cwd();
    const entries = new Set(await readdir(targetDir));
    for (const [marker, vcs] of VCS_MARKERS) {
      if (entries.has(marker)) {
        detected.add(vcs);
      }
    }
  } catch {
  }
  return [...detected];
}
export {
  SUPPORTED_PLATFORMS,
  detectVcs,
  getLinuxDistroInfo,
  getPlatform,
  getWslVersion
};
