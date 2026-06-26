import { execa } from "execa";
import { getCwd } from "../utils/cwd.js";
import { logError } from "./log.js";
import { execSyncWithDefaults_DEPRECATED } from "./execFileNoThrowPortable.js";
const MS_IN_SECOND = 1e3;
const SECONDS_IN_MINUTE = 60;
function execFileNoThrow(file, args, options = {
  timeout: 10 * SECONDS_IN_MINUTE * MS_IN_SECOND,
  preserveOutputOnError: true,
  useCwd: true
}) {
  return execFileNoThrowWithCwd(file, args, {
    abortSignal: options.abortSignal,
    timeout: options.timeout,
    preserveOutputOnError: options.preserveOutputOnError,
    cwd: options.useCwd ? getCwd() : void 0,
    env: options.env,
    stdin: options.stdin,
    input: options.input
  });
}
function getErrorMessage(result, errorCode) {
  if (result.shortMessage) {
    return result.shortMessage;
  }
  if (typeof result.signal === "string") {
    return result.signal;
  }
  return String(errorCode);
}
function execFileNoThrowWithCwd(file, args, {
  abortSignal,
  timeout: finalTimeout = 10 * SECONDS_IN_MINUTE * MS_IN_SECOND,
  preserveOutputOnError: finalPreserveOutput = true,
  cwd: finalCwd,
  env: finalEnv,
  maxBuffer,
  shell,
  stdin: finalStdin,
  input: finalInput
} = {
  timeout: 10 * SECONDS_IN_MINUTE * MS_IN_SECOND,
  preserveOutputOnError: true,
  maxBuffer: 1e6
}) {
  return new Promise((resolve) => {
    execa(file, args, {
      maxBuffer,
      signal: abortSignal,
      timeout: finalTimeout,
      cwd: finalCwd,
      env: finalEnv,
      shell,
      stdin: finalStdin,
      input: finalInput,
      reject: false
      // Don't throw on non-zero exit codes
    }).then((result) => {
      if (result.failed) {
        if (finalPreserveOutput) {
          const errorCode = result.exitCode ?? 1;
          void resolve({
            stdout: result.stdout || "",
            stderr: result.stderr || "",
            code: errorCode,
            error: getErrorMessage(
              result,
              errorCode
            )
          });
        } else {
          void resolve({ stdout: "", stderr: "", code: result.exitCode ?? 1 });
        }
      } else {
        void resolve({
          stdout: result.stdout,
          stderr: result.stderr,
          code: 0
        });
      }
    }).catch((error) => {
      logError(error);
      void resolve({ stdout: "", stderr: "", code: 1 });
    });
  });
}
export {
  execFileNoThrow,
  execFileNoThrowWithCwd,
  execSyncWithDefaults_DEPRECATED
};
