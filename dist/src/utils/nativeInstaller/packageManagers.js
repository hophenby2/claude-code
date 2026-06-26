import { readFile } from "fs/promises";
import memoize from "lodash-es/memoize.js";
import { logForDebugging } from "../debug.js";
import { execFileNoThrow } from "../execFileNoThrow.js";
import { getPlatform } from "../platform.js";
const getOsRelease = memoize(
  async () => {
    try {
      const content = await readFile("/etc/os-release", "utf8");
      const idMatch = content.match(/^ID=["']?(\S+?)["']?\s*$/m);
      const idLikeMatch = content.match(/^ID_LIKE=["']?(.+?)["']?\s*$/m);
      return {
        id: idMatch?.[1] ?? "",
        idLike: idLikeMatch?.[1]?.split(" ") ?? []
      };
    } catch {
      return null;
    }
  }
);
function isDistroFamily(osRelease, families) {
  return families.includes(osRelease.id) || osRelease.idLike.some((like) => families.includes(like));
}
function detectMise() {
  const execPath = process.execPath || process.argv[0] || "";
  if (/[/\\]mise[/\\]installs[/\\]/i.test(execPath)) {
    logForDebugging(`Detected mise installation: ${execPath}`);
    return true;
  }
  return false;
}
function detectAsdf() {
  const execPath = process.execPath || process.argv[0] || "";
  if (/[/\\]\.?asdf[/\\]installs[/\\]/i.test(execPath)) {
    logForDebugging(`Detected asdf installation: ${execPath}`);
    return true;
  }
  return false;
}
function detectHomebrew() {
  const platform = getPlatform();
  if (platform !== "macos" && platform !== "linux" && platform !== "wsl") {
    return false;
  }
  const execPath = process.execPath || process.argv[0] || "";
  if (execPath.includes("/Caskroom/")) {
    logForDebugging(`Detected Homebrew cask installation: ${execPath}`);
    return true;
  }
  return false;
}
function detectWinget() {
  const platform = getPlatform();
  if (platform !== "windows") {
    return false;
  }
  const execPath = process.execPath || process.argv[0] || "";
  const wingetPatterns = [
    /Microsoft[/\\]WinGet[/\\]Packages/i,
    /Microsoft[/\\]WinGet[/\\]Links/i
  ];
  for (const pattern of wingetPatterns) {
    if (pattern.test(execPath)) {
      logForDebugging(`Detected winget installation: ${execPath}`);
      return true;
    }
  }
  return false;
}
const detectPacman = memoize(async () => {
  const platform = getPlatform();
  if (platform !== "linux") {
    return false;
  }
  const osRelease = await getOsRelease();
  if (osRelease && !isDistroFamily(osRelease, ["arch"])) {
    return false;
  }
  const execPath = process.execPath || process.argv[0] || "";
  const result = await execFileNoThrow("pacman", ["-Qo", execPath], {
    timeout: 5e3,
    useCwd: false
  });
  if (result.code === 0 && result.stdout) {
    logForDebugging(`Detected pacman installation: ${result.stdout.trim()}`);
    return true;
  }
  return false;
});
const detectDeb = memoize(async () => {
  const platform = getPlatform();
  if (platform !== "linux") {
    return false;
  }
  const osRelease = await getOsRelease();
  if (osRelease && !isDistroFamily(osRelease, ["debian"])) {
    return false;
  }
  const execPath = process.execPath || process.argv[0] || "";
  const result = await execFileNoThrow("dpkg", ["-S", execPath], {
    timeout: 5e3,
    useCwd: false
  });
  if (result.code === 0 && result.stdout) {
    logForDebugging(`Detected deb installation: ${result.stdout.trim()}`);
    return true;
  }
  return false;
});
const detectRpm = memoize(async () => {
  const platform = getPlatform();
  if (platform !== "linux") {
    return false;
  }
  const osRelease = await getOsRelease();
  if (osRelease && !isDistroFamily(osRelease, ["fedora", "rhel", "suse"])) {
    return false;
  }
  const execPath = process.execPath || process.argv[0] || "";
  const result = await execFileNoThrow("rpm", ["-qf", execPath], {
    timeout: 5e3,
    useCwd: false
  });
  if (result.code === 0 && result.stdout) {
    logForDebugging(`Detected rpm installation: ${result.stdout.trim()}`);
    return true;
  }
  return false;
});
const detectApk = memoize(async () => {
  const platform = getPlatform();
  if (platform !== "linux") {
    return false;
  }
  const osRelease = await getOsRelease();
  if (osRelease && !isDistroFamily(osRelease, ["alpine"])) {
    return false;
  }
  const execPath = process.execPath || process.argv[0] || "";
  const result = await execFileNoThrow(
    "apk",
    ["info", "--who-owns", execPath],
    {
      timeout: 5e3,
      useCwd: false
    }
  );
  if (result.code === 0 && result.stdout) {
    logForDebugging(`Detected apk installation: ${result.stdout.trim()}`);
    return true;
  }
  return false;
});
const getPackageManager = memoize(async () => {
  if (detectHomebrew()) {
    return "homebrew";
  }
  if (detectWinget()) {
    return "winget";
  }
  if (detectMise()) {
    return "mise";
  }
  if (detectAsdf()) {
    return "asdf";
  }
  if (await detectPacman()) {
    return "pacman";
  }
  if (await detectApk()) {
    return "apk";
  }
  if (await detectDeb()) {
    return "deb";
  }
  if (await detectRpm()) {
    return "rpm";
  }
  return "unknown";
});
export {
  detectApk,
  detectAsdf,
  detectDeb,
  detectHomebrew,
  detectMise,
  detectPacman,
  detectRpm,
  detectWinget,
  getOsRelease,
  getPackageManager
};
