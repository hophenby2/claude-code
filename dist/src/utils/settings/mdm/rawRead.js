import { execFile } from "child_process";
import { existsSync } from "fs";
import {
  getMacOSPlistPaths,
  MDM_SUBPROCESS_TIMEOUT_MS,
  PLUTIL_ARGS_PREFIX,
  PLUTIL_PATH,
  WINDOWS_REGISTRY_KEY_PATH_HKCU,
  WINDOWS_REGISTRY_KEY_PATH_HKLM,
  WINDOWS_REGISTRY_VALUE_NAME
} from "./constants.js";
let rawReadPromise = null;
function execFilePromise(cmd, args) {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { encoding: "utf-8", timeout: MDM_SUBPROCESS_TIMEOUT_MS },
      (err, stdout) => {
        resolve({ stdout: stdout ?? "", code: err ? 1 : 0 });
      }
    );
  });
}
function fireRawRead() {
  return (async () => {
    if (process.platform === "darwin") {
      const plistPaths = getMacOSPlistPaths();
      const allResults = await Promise.all(
        plistPaths.map(async ({ path, label }) => {
          if (!existsSync(path)) {
            return { stdout: "", label, ok: false };
          }
          const { stdout, code } = await execFilePromise(PLUTIL_PATH, [
            ...PLUTIL_ARGS_PREFIX,
            path
          ]);
          return { stdout, label, ok: code === 0 && !!stdout };
        })
      );
      const winner = allResults.find((r) => r.ok);
      return {
        plistStdouts: winner ? [{ stdout: winner.stdout, label: winner.label }] : [],
        hklmStdout: null,
        hkcuStdout: null
      };
    }
    if (process.platform === "win32") {
      const [hklm, hkcu] = await Promise.all([
        execFilePromise("reg", [
          "query",
          WINDOWS_REGISTRY_KEY_PATH_HKLM,
          "/v",
          WINDOWS_REGISTRY_VALUE_NAME
        ]),
        execFilePromise("reg", [
          "query",
          WINDOWS_REGISTRY_KEY_PATH_HKCU,
          "/v",
          WINDOWS_REGISTRY_VALUE_NAME
        ])
      ]);
      return {
        plistStdouts: null,
        hklmStdout: hklm.code === 0 ? hklm.stdout : null,
        hkcuStdout: hkcu.code === 0 ? hkcu.stdout : null
      };
    }
    return { plistStdouts: null, hklmStdout: null, hkcuStdout: null };
  })();
}
function startMdmRawRead() {
  if (rawReadPromise) return;
  rawReadPromise = fireRawRead();
}
function getMdmRawReadPromise() {
  return rawReadPromise;
}
export {
  fireRawRead,
  getMdmRawReadPromise,
  startMdmRawRead
};
