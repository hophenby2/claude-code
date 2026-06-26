import { execFileSync } from "child_process";
class WindowsToWSLConverter {
  constructor(wslDistroName) {
    this.wslDistroName = wslDistroName;
  }
  wslDistroName;
  toLocalPath(windowsPath) {
    if (!windowsPath) return windowsPath;
    if (this.wslDistroName) {
      const wslUncMatch = windowsPath.match(
        /^\\\\wsl(?:\.localhost|\$)\\([^\\]+)(.*)$/
      );
      if (wslUncMatch && wslUncMatch[1] !== this.wslDistroName) {
        return windowsPath;
      }
    }
    try {
      const result = execFileSync("wslpath", ["-u", windowsPath], {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"]
        // wslpath writes "wslpath: <errortext>" to stderr
      }).trim();
      return result;
    } catch {
      return windowsPath.replace(/\\/g, "/").replace(/^([A-Z]):/i, (_, letter) => `/mnt/${letter.toLowerCase()}`);
    }
  }
  toIDEPath(wslPath) {
    if (!wslPath) return wslPath;
    try {
      const result = execFileSync("wslpath", ["-w", wslPath], {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"]
        // wslpath writes "wslpath: <errortext>" to stderr
      }).trim();
      return result;
    } catch {
      return wslPath;
    }
  }
}
function checkWSLDistroMatch(windowsPath, wslDistroName) {
  const wslUncMatch = windowsPath.match(
    /^\\\\wsl(?:\.localhost|\$)\\([^\\]+)(.*)$/
  );
  if (wslUncMatch) {
    return wslUncMatch[1] === wslDistroName;
  }
  return true;
}
export {
  WindowsToWSLConverter,
  checkWSLDistroMatch
};
