import { execFile } from "child_process";
import { execa } from "execa";
import { mkdir, stat } from "fs/promises";
import * as os from "os";
import { join } from "path";
import { logEvent } from "../../services/analytics/index.js";
import { registerCleanup } from "../cleanupRegistry.js";
import { getCwd } from "../cwd.js";
import { logForDebugging } from "../debug.js";
import {
  embeddedSearchToolsBinaryPath,
  hasEmbeddedSearchTools
} from "../embeddedTools.js";
import { getClaudeConfigHomeDir } from "../envUtils.js";
import { pathExists } from "../file.js";
import { getFsImplementation } from "../fsOperations.js";
import { logError } from "../log.js";
import { getPlatform } from "../platform.js";
import { ripgrepCommand } from "../ripgrep.js";
import { subprocessEnv } from "../subprocessEnv.js";
import { quote } from "./shellQuote.js";
const LITERAL_BACKSLASH = "\\";
const SNAPSHOT_CREATION_TIMEOUT = 1e4;
function createArgv0ShellFunction(funcName, argv0, binaryPath, prependArgs = []) {
  const quotedPath = quote([binaryPath]);
  const argSuffix = prependArgs.length > 0 ? `${prependArgs.join(" ")} "$@"` : '"$@"';
  return [
    `function ${funcName} {`,
    "  if [[ -n $ZSH_VERSION ]]; then",
    `    ARGV0=${argv0} ${quotedPath} ${argSuffix}`,
    '  elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then',
    // On Windows (git bash), exec -a does not work, so use ARGV0 env var instead
    // The bun binary reads from ARGV0 natively to set argv[0]
    `    ARGV0=${argv0} ${quotedPath} ${argSuffix}`,
    "  elif [[ $BASHPID != $$ ]]; then",
    `    exec -a ${argv0} ${quotedPath} ${argSuffix}`,
    "  else",
    `    (exec -a ${argv0} ${quotedPath} ${argSuffix})`,
    "  fi",
    "}"
  ].join("\n");
}
function createRipgrepShellIntegration() {
  const rgCommand = ripgrepCommand();
  if (rgCommand.argv0) {
    return {
      type: "function",
      snippet: createArgv0ShellFunction(
        "rg",
        rgCommand.argv0,
        rgCommand.rgPath
      )
    };
  }
  const quotedPath = quote([rgCommand.rgPath]);
  const quotedArgs = rgCommand.rgArgs.map((arg) => quote([arg]));
  const aliasTarget = rgCommand.rgArgs.length > 0 ? `${quotedPath} ${quotedArgs.join(" ")}` : quotedPath;
  return { type: "alias", snippet: aliasTarget };
}
const VCS_DIRECTORIES_TO_EXCLUDE = [
  ".git",
  ".svn",
  ".hg",
  ".bzr",
  ".jj",
  ".sl"
];
function createFindGrepShellIntegration() {
  if (!hasEmbeddedSearchTools()) {
    return null;
  }
  const binaryPath = embeddedSearchToolsBinaryPath();
  return [
    // User shell configs may define aliases like `alias find=gfind` or
    // `alias grep=ggrep` (common on macOS with Homebrew GNU tools). The
    // snapshot sources user aliases before these function definitions, and
    // bash expands aliases before function lookup — so a renaming alias
    // would silently bypass the embedded bfs/ugrep dispatch. Clear them first
    // (same fix the rg integration uses).
    "unalias find 2>/dev/null || true",
    "unalias grep 2>/dev/null || true",
    createArgv0ShellFunction("find", "bfs", binaryPath, [
      "-regextype",
      "findutils-default"
    ]),
    createArgv0ShellFunction("grep", "ugrep", binaryPath, [
      "-G",
      "--ignore-files",
      "--hidden",
      "-I",
      ...VCS_DIRECTORIES_TO_EXCLUDE.map((d) => `--exclude-dir=${d}`)
    ])
  ].join("\n");
}
function getConfigFile(shellPath) {
  const fileName = shellPath.includes("zsh") ? ".zshrc" : shellPath.includes("bash") ? ".bashrc" : ".profile";
  const configPath = join(os.homedir(), fileName);
  return configPath;
}
function getUserSnapshotContent(configFile) {
  const isZsh = configFile.endsWith(".zshrc");
  let content = "";
  if (isZsh) {
    content += `
      echo "# Functions" >> "$SNAPSHOT_FILE"

      # Force autoload all functions first
      typeset -f > /dev/null 2>&1

      # Now get user function names - filter completion functions (single underscore prefix)
      # but keep double-underscore helpers (e.g. __zsh_like_cd from mise, __pyenv_init)
      typeset +f | grep -vE '^_[^_]' | while read func; do
        typeset -f "$func" >> "$SNAPSHOT_FILE"
      done
    `;
  } else {
    content += `
      echo "# Functions" >> "$SNAPSHOT_FILE"

      # Force autoload all functions first
      declare -f > /dev/null 2>&1

      # Now get user function names - filter completion functions (single underscore prefix)
      # but keep double-underscore helpers (e.g. __zsh_like_cd from mise, __pyenv_init)
      declare -F | cut -d' ' -f3 | grep -vE '^_[^_]' | while read func; do
        # Encode the function to base64, preserving all special characters
        encoded_func=$(declare -f "$func" | base64 )
        # Write the function definition to the snapshot
        echo "eval ${LITERAL_BACKSLASH}"${LITERAL_BACKSLASH}$(echo '$encoded_func' | base64 -d)${LITERAL_BACKSLASH}" > /dev/null 2>&1" >> "$SNAPSHOT_FILE"
      done
    `;
  }
  if (isZsh) {
    content += `
      echo "# Shell Options" >> "$SNAPSHOT_FILE"
      setopt | sed 's/^/setopt /' | head -n 1000 >> "$SNAPSHOT_FILE"
    `;
  } else {
    content += `
      echo "# Shell Options" >> "$SNAPSHOT_FILE"
      shopt -p | head -n 1000 >> "$SNAPSHOT_FILE"
      set -o | grep "on" | awk '{print "set -o " $1}' | head -n 1000 >> "$SNAPSHOT_FILE"
      echo "shopt -s expand_aliases" >> "$SNAPSHOT_FILE"
    `;
  }
  content += `
      echo "# Aliases" >> "$SNAPSHOT_FILE"
      # Filter out winpty aliases on Windows to avoid "stdin is not a tty" errors
      # Git Bash automatically creates aliases like "alias node='winpty node.exe'" for
      # programs that need Win32 Console in mintty, but winpty fails when there's no TTY
      if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
        alias | grep -v "='winpty " | sed 's/^alias //g' | sed 's/^/alias -- /' | head -n 1000 >> "$SNAPSHOT_FILE"
      else
        alias | sed 's/^alias //g' | sed 's/^/alias -- /' | head -n 1000 >> "$SNAPSHOT_FILE"
      fi
  `;
  return content;
}
async function getClaudeCodeSnapshotContent() {
  let pathValue = process.env.PATH;
  if (getPlatform() === "windows") {
    const cygwinResult = await execa("echo $PATH", {
      shell: true,
      reject: false
    });
    if (cygwinResult.exitCode === 0 && cygwinResult.stdout) {
      pathValue = cygwinResult.stdout.trim();
    }
  }
  const rgIntegration = createRipgrepShellIntegration();
  let content = "";
  content += `
      # Check for rg availability
      echo "# Check for rg availability" >> "$SNAPSHOT_FILE"
      echo "if ! (unalias rg 2>/dev/null; command -v rg) >/dev/null 2>&1; then" >> "$SNAPSHOT_FILE"
  `;
  if (rgIntegration.type === "function") {
    content += `
      cat >> "$SNAPSHOT_FILE" << 'RIPGREP_FUNC_END'
  ${rgIntegration.snippet}
RIPGREP_FUNC_END
    `;
  } else {
    const escapedSnippet = rgIntegration.snippet.replace(/'/g, "'\\''");
    content += `
      echo '  alias rg='"'${escapedSnippet}'" >> "$SNAPSHOT_FILE"
    `;
  }
  content += `
      echo "fi" >> "$SNAPSHOT_FILE"
  `;
  const findGrepIntegration = createFindGrepShellIntegration();
  if (findGrepIntegration !== null) {
    content += `
      # Shadow find/grep with embedded bfs/ugrep (ant-native only)
      echo "# Shadow find/grep with embedded bfs/ugrep" >> "$SNAPSHOT_FILE"
      cat >> "$SNAPSHOT_FILE" << 'FIND_GREP_FUNC_END'
${findGrepIntegration}
FIND_GREP_FUNC_END
    `;
  }
  content += `

      # Add PATH to the file
      echo "export PATH=${quote([pathValue || ""])}" >> "$SNAPSHOT_FILE"
  `;
  return content;
}
async function getSnapshotScript(shellPath, snapshotFilePath, configFileExists) {
  const configFile = getConfigFile(shellPath);
  const isZsh = configFile.endsWith(".zshrc");
  const userContent = configFileExists ? getUserSnapshotContent(configFile) : !isZsh ? (
    // we need to manually force alias expansion in bash - normally `getUserSnapshotContent` takes care of this
    'echo "shopt -s expand_aliases" >> "$SNAPSHOT_FILE"'
  ) : "";
  const claudeCodeContent = await getClaudeCodeSnapshotContent();
  const script = `SNAPSHOT_FILE=${quote([snapshotFilePath])}
      ${configFileExists ? `source "${configFile}" < /dev/null` : "# No user config file to source"}

      # First, create/clear the snapshot file
      echo "# Snapshot file" >| "$SNAPSHOT_FILE"

      # When this file is sourced, we first unalias to avoid conflicts
      # This is necessary because aliases get "frozen" inside function definitions at definition time,
      # which can cause unexpected behavior when functions use commands that conflict with aliases
      echo "# Unset all aliases to avoid conflicts with functions" >> "$SNAPSHOT_FILE"
      echo "unalias -a 2>/dev/null || true" >> "$SNAPSHOT_FILE"

      ${userContent}

      ${claudeCodeContent}

      # Exit silently on success, only report errors
      if [ ! -f "$SNAPSHOT_FILE" ]; then
        echo "Error: Snapshot file was not created at $SNAPSHOT_FILE" >&2
        exit 1
      fi
    `;
  return script;
}
const createAndSaveSnapshot = async (binShell) => {
  const shellType = binShell.includes("zsh") ? "zsh" : binShell.includes("bash") ? "bash" : "sh";
  logForDebugging(`Creating shell snapshot for ${shellType} (${binShell})`);
  return new Promise(async (resolve) => {
    try {
      const configFile = getConfigFile(binShell);
      logForDebugging(`Looking for shell config file: ${configFile}`);
      const configFileExists = await pathExists(configFile);
      if (!configFileExists) {
        logForDebugging(
          `Shell config file not found: ${configFile}, creating snapshot with Claude Code defaults only`
        );
      }
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 8);
      const snapshotsDir = join(getClaudeConfigHomeDir(), "shell-snapshots");
      logForDebugging(`Snapshots directory: ${snapshotsDir}`);
      const shellSnapshotPath = join(
        snapshotsDir,
        `snapshot-${shellType}-${timestamp}-${randomId}.sh`
      );
      await mkdir(snapshotsDir, { recursive: true });
      const snapshotScript = await getSnapshotScript(
        binShell,
        shellSnapshotPath,
        configFileExists
      );
      logForDebugging(`Creating snapshot at: ${shellSnapshotPath}`);
      logForDebugging(`Execution timeout: ${SNAPSHOT_CREATION_TIMEOUT}ms`);
      execFile(
        binShell,
        ["-c", "-l", snapshotScript],
        {
          env: {
            ...process.env.CLAUDE_CODE_DONT_INHERIT_ENV ? {} : subprocessEnv(),
            SHELL: binShell,
            GIT_EDITOR: "true",
            CLAUDECODE: "1"
          },
          timeout: SNAPSHOT_CREATION_TIMEOUT,
          maxBuffer: 1024 * 1024,
          // 1MB buffer
          encoding: "utf8"
        },
        async (error, stdout, stderr) => {
          if (error) {
            const execError = error;
            logForDebugging(`Shell snapshot creation failed: ${error.message}`);
            logForDebugging(`Error details:`);
            logForDebugging(`  - Error code: ${execError?.code}`);
            logForDebugging(`  - Error signal: ${execError?.signal}`);
            logForDebugging(`  - Error killed: ${execError?.killed}`);
            logForDebugging(`  - Shell path: ${binShell}`);
            logForDebugging(`  - Config file: ${getConfigFile(binShell)}`);
            logForDebugging(`  - Config file exists: ${configFileExists}`);
            logForDebugging(`  - Working directory: ${getCwd()}`);
            logForDebugging(`  - Claude home: ${getClaudeConfigHomeDir()}`);
            logForDebugging(`Full snapshot script:
${snapshotScript}`);
            if (stdout) {
              logForDebugging(
                `stdout output (${stdout.length} chars):
${stdout}`
              );
            } else {
              logForDebugging(`No stdout output captured`);
            }
            if (stderr) {
              logForDebugging(
                `stderr output (${stderr.length} chars): ${stderr}`
              );
            } else {
              logForDebugging(`No stderr output captured`);
            }
            logError(
              new Error(`Failed to create shell snapshot: ${error.message}`)
            );
            const signalNumber = execError?.signal ? os.constants.signals[execError.signal] : void 0;
            logEvent("tengu_shell_snapshot_failed", {
              stderr_length: stderr?.length || 0,
              has_error_code: !!execError?.code,
              error_signal_number: signalNumber,
              error_killed: execError?.killed
            });
            resolve(void 0);
          } else {
            let snapshotSize;
            try {
              snapshotSize = (await stat(shellSnapshotPath)).size;
            } catch {
            }
            if (snapshotSize !== void 0) {
              logForDebugging(
                `Shell snapshot created successfully (${snapshotSize} bytes)`
              );
              registerCleanup(async () => {
                try {
                  await getFsImplementation().unlink(shellSnapshotPath);
                  logForDebugging(
                    `Cleaned up session snapshot: ${shellSnapshotPath}`
                  );
                } catch (error2) {
                  logForDebugging(
                    `Error cleaning up session snapshot: ${error2}`
                  );
                }
              });
              resolve(shellSnapshotPath);
            } else {
              logForDebugging(
                `Shell snapshot file not found after creation: ${shellSnapshotPath}`
              );
              logForDebugging(
                `Checking if parent directory still exists: ${snapshotsDir}`
              );
              try {
                const dirContents = await getFsImplementation().readdir(snapshotsDir);
                logForDebugging(
                  `Directory contains ${dirContents.length} files`
                );
              } catch {
                logForDebugging(
                  `Parent directory does not exist or is not accessible: ${snapshotsDir}`
                );
              }
              logEvent("tengu_shell_unknown_error", {});
              resolve(void 0);
            }
          }
        }
      );
    } catch (error) {
      logForDebugging(`Unexpected error during snapshot creation: ${error}`);
      if (error instanceof Error) {
        logForDebugging(`Error stack trace: ${error.stack}`);
      }
      logError(error);
      logEvent("tengu_shell_snapshot_error", {});
      resolve(void 0);
    }
  });
};
export {
  createAndSaveSnapshot,
  createFindGrepShellIntegration,
  createRipgrepShellIntegration
};
