import { realpath, stat } from "fs/promises";
import { getPlatform } from "../platform.js";
import { which } from "../which.js";
async function probePath(p) {
  try {
    return (await stat(p)).isFile() ? p : null;
  } catch {
    return null;
  }
}
async function findPowerShell() {
  const pwshPath = await which("pwsh");
  if (pwshPath) {
    if (getPlatform() === "linux") {
      const resolved = await realpath(pwshPath).catch(() => pwshPath);
      if (pwshPath.startsWith("/snap/") || resolved.startsWith("/snap/")) {
        const direct = await probePath("/opt/microsoft/powershell/7/pwsh") ?? await probePath("/usr/bin/pwsh");
        if (direct) {
          const directResolved = await realpath(direct).catch(() => direct);
          if (!direct.startsWith("/snap/") && !directResolved.startsWith("/snap/")) {
            return direct;
          }
        }
      }
    }
    return pwshPath;
  }
  const powershellPath = await which("powershell");
  if (powershellPath) {
    return powershellPath;
  }
  return null;
}
let cachedPowerShellPath = null;
function getCachedPowerShellPath() {
  if (!cachedPowerShellPath) {
    cachedPowerShellPath = findPowerShell();
  }
  return cachedPowerShellPath;
}
async function getPowerShellEdition() {
  const p = await getCachedPowerShellPath();
  if (!p) return null;
  const base = p.split(/[/\\]/).pop().toLowerCase().replace(/\.exe$/, "");
  return base === "pwsh" ? "core" : "desktop";
}
function resetPowerShellCache() {
  cachedPowerShellPath = null;
}
export {
  findPowerShell,
  getCachedPowerShellPath,
  getPowerShellEdition,
  resetPowerShellCache
};
