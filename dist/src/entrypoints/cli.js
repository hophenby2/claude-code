#!/usr/bin/env node
const feature = (_name) => false;
process.env.COREPACK_ENABLE_AUTO_PIN = "0";
if (process.env.CLAUDE_CODE_REMOTE === "true") {
  const existing = process.env.NODE_OPTIONS || "";
  process.env.NODE_OPTIONS = existing ? `${existing} --max-old-space-size=8192` : "--max-old-space-size=8192";
}
if (false) {
  for (const k of ["CLAUDE_CODE_SIMPLE", "CLAUDE_CODE_DISABLE_THINKING", "DISABLE_INTERLEAVED_THINKING", "DISABLE_COMPACT", "DISABLE_AUTO_COMPACT", "CLAUDE_CODE_DISABLE_AUTO_MEMORY", "CLAUDE_CODE_DISABLE_BACKGROUND_TASKS"]) {
    process.env[k] ??= "1";
  }
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && (args[0] === "--version" || args[0] === "-v" || args[0] === "-V")) {
    console.log(`${"0.0.0"} (Claude Code)`);
    return;
  }
  const {
    profileCheckpoint
  } = await import("../utils/startupProfiler.js");
  profileCheckpoint("cli_entry");
  if (false) {
    profileCheckpoint("cli_dump_system_prompt_path");
    const {
      enableConfigs
    } = await null;
    enableConfigs();
    const {
      getMainLoopModel
    } = await null;
    const modelIdx = args.indexOf("--model");
    const model = modelIdx !== -1 && args[modelIdx + 1] || getMainLoopModel();
    const {
      getSystemPrompt
    } = await null;
    const prompt = await getSystemPrompt([], model);
    console.log(prompt.join("\n"));
    return;
  }
  if (process.argv[2] === "--claude-in-chrome-mcp") {
    profileCheckpoint("cli_claude_in_chrome_mcp_path");
    const {
      runClaudeInChromeMcpServer
    } = await import("../utils/claudeInChrome/mcpServer.js");
    await runClaudeInChromeMcpServer();
    return;
  } else if (process.argv[2] === "--chrome-native-host") {
    profileCheckpoint("cli_chrome_native_host_path");
    const {
      runChromeNativeHost
    } = await import("../utils/claudeInChrome/chromeNativeHost.js");
    await runChromeNativeHost();
    return;
  } else if (false) {
    profileCheckpoint("cli_computer_use_mcp_path");
    const {
      runComputerUseMcpServer
    } = await null;
    await runComputerUseMcpServer();
    return;
  }
  if (false) {
    const {
      runDaemonWorker
    } = await null;
    await runDaemonWorker(args[1]);
    return;
  }
  if (false) {
    profileCheckpoint("cli_bridge_path");
    const {
      enableConfigs
    } = await null;
    enableConfigs();
    const {
      getBridgeDisabledReason,
      checkBridgeMinVersion
    } = await null;
    const {
      BRIDGE_LOGIN_ERROR
    } = await null;
    const {
      bridgeMain
    } = await null;
    const {
      exitWithError
    } = await null;
    const {
      getClaudeAIOAuthTokens
    } = await null;
    if (!getClaudeAIOAuthTokens()?.accessToken) {
      exitWithError(BRIDGE_LOGIN_ERROR);
    }
    const disabledReason = await getBridgeDisabledReason();
    if (disabledReason) {
      exitWithError(`Error: ${disabledReason}`);
    }
    const versionError = checkBridgeMinVersion();
    if (versionError) {
      exitWithError(versionError);
    }
    const {
      waitForPolicyLimitsToLoad,
      isPolicyAllowed
    } = await null;
    await waitForPolicyLimitsToLoad();
    if (!isPolicyAllowed("allow_remote_control")) {
      exitWithError("Error: Remote Control is disabled by your organization's policy.");
    }
    await bridgeMain(args.slice(1));
    return;
  }
  if (false) {
    profileCheckpoint("cli_daemon_path");
    const {
      enableConfigs
    } = await null;
    enableConfigs();
    const {
      initSinks
    } = await null;
    initSinks();
    const {
      daemonMain
    } = await null;
    await daemonMain(args.slice(1));
    return;
  }
  if (false) {
    profileCheckpoint("cli_bg_path");
    const {
      enableConfigs
    } = await null;
    enableConfigs();
    const bg = await null;
    switch (args[0]) {
      case "ps":
        await bg.psHandler(args.slice(1));
        break;
      case "logs":
        await bg.logsHandler(args[1]);
        break;
      case "attach":
        await bg.attachHandler(args[1]);
        break;
      case "kill":
        await bg.killHandler(args[1]);
        break;
      default:
        await bg.handleBgFlag(args);
    }
    return;
  }
  if (false) {
    profileCheckpoint("cli_templates_path");
    const {
      templatesMain
    } = await null;
    await templatesMain(args);
    process.exit(0);
  }
  if (false) {
    profileCheckpoint("cli_environment_runner_path");
    const {
      environmentRunnerMain
    } = await null;
    await environmentRunnerMain(args.slice(1));
    return;
  }
  if (false) {
    profileCheckpoint("cli_self_hosted_runner_path");
    const {
      selfHostedRunnerMain
    } = await null;
    await selfHostedRunnerMain(args.slice(1));
    return;
  }
  const hasTmuxFlag = args.includes("--tmux") || args.includes("--tmux=classic");
  if (hasTmuxFlag && (args.includes("-w") || args.includes("--worktree") || args.some((a) => a.startsWith("--worktree=")))) {
    profileCheckpoint("cli_tmux_worktree_fast_path");
    const {
      enableConfigs
    } = await import("../utils/config.js");
    enableConfigs();
    const {
      isWorktreeModeEnabled
    } = await import("../utils/worktreeModeEnabled.js");
    if (isWorktreeModeEnabled()) {
      const {
        execIntoTmuxWorktree
      } = await import("../utils/worktree.js");
      const result = await execIntoTmuxWorktree(args);
      if (result.handled) {
        return;
      }
      if (result.error) {
        const {
          exitWithError
        } = await import("../utils/process.js");
        exitWithError(result.error);
      }
    }
  }
  if (args.length === 1 && (args[0] === "--update" || args[0] === "--upgrade")) {
    process.argv = [process.argv[0], process.argv[1], "update"];
  }
  if (args.includes("--bare")) {
    process.env.CLAUDE_CODE_SIMPLE = "1";
  }
  const {
    startCapturingEarlyInput
  } = await import("../utils/earlyInput.js");
  startCapturingEarlyInput();
  profileCheckpoint("cli_before_main_import");
  const {
    main: cliMain
  } = await import("../main.js");
  profileCheckpoint("cli_after_main_import");
  await cliMain();
  profileCheckpoint("cli_after_main_complete");
}
void main();
