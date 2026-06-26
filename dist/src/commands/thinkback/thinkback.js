import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { execa } from "execa";
import { readFile } from "fs/promises";
import { join } from "path";
import { useEffect, useState } from "react";
import { Select } from "../../components/CustomSelect/select.js";
import { Dialog } from "../../components/design-system/Dialog.js";
import { Spinner } from "../../components/Spinner.js";
import instances from "../../ink/instances.js";
import { Box, Text } from "../../ink.js";
import { enablePluginOp } from "../../services/plugins/pluginOperations.js";
import { logForDebugging } from "../../utils/debug.js";
import { isENOENT, toError } from "../../utils/errors.js";
import { execFileNoThrow } from "../../utils/execFileNoThrow.js";
import { pathExists } from "../../utils/file.js";
import { logError } from "../../utils/log.js";
import { getPlatform } from "../../utils/platform.js";
import { clearAllCaches } from "../../utils/plugins/cacheUtils.js";
import { isPluginInstalled } from "../../utils/plugins/installedPluginsManager.js";
import { addMarketplaceSource, clearMarketplacesCache, loadKnownMarketplacesConfig, refreshMarketplace } from "../../utils/plugins/marketplaceManager.js";
import { OFFICIAL_MARKETPLACE_NAME } from "../../utils/plugins/officialMarketplace.js";
import { loadAllPlugins } from "../../utils/plugins/pluginLoader.js";
import { installSelectedPlugins } from "../../utils/plugins/pluginStartupCheck.js";
const INTERNAL_MARKETPLACE_NAME = "claude-code-marketplace";
const INTERNAL_MARKETPLACE_REPO = "anthropics/claude-code-marketplace";
const OFFICIAL_MARKETPLACE_REPO = "anthropics/claude-plugins-official";
function getMarketplaceName() {
  return false ? INTERNAL_MARKETPLACE_NAME : OFFICIAL_MARKETPLACE_NAME;
}
function getMarketplaceRepo() {
  return false ? INTERNAL_MARKETPLACE_REPO : OFFICIAL_MARKETPLACE_REPO;
}
function getPluginId() {
  return `thinkback@${getMarketplaceName()}`;
}
const SKILL_NAME = "thinkback";
async function getThinkbackSkillDir() {
  const {
    enabled
  } = await loadAllPlugins();
  const thinkbackPlugin = enabled.find((p) => p.name === "thinkback" || p.source && p.source.includes(getPluginId()));
  if (!thinkbackPlugin) {
    return null;
  }
  const skillDir = join(thinkbackPlugin.path, "skills", SKILL_NAME);
  if (await pathExists(skillDir)) {
    return skillDir;
  }
  return null;
}
async function playAnimation(skillDir) {
  const dataPath = join(skillDir, "year_in_review.js");
  const playerPath = join(skillDir, "player.js");
  try {
    await readFile(dataPath);
  } catch (e) {
    if (isENOENT(e)) {
      return {
        success: false,
        message: "No animation found. Run /think-back first to generate one."
      };
    }
    logError(e);
    return {
      success: false,
      message: `Could not access animation data: ${toError(e).message}`
    };
  }
  try {
    await readFile(playerPath);
  } catch (e) {
    if (isENOENT(e)) {
      return {
        success: false,
        message: "Player script not found. The player.js file is missing from the thinkback skill."
      };
    }
    logError(e);
    return {
      success: false,
      message: `Could not access player script: ${toError(e).message}`
    };
  }
  const inkInstance = instances.get(process.stdout);
  if (!inkInstance) {
    return {
      success: false,
      message: "Failed to access terminal instance"
    };
  }
  inkInstance.enterAlternateScreen();
  try {
    await execa("node", [playerPath], {
      stdio: "inherit",
      cwd: skillDir,
      reject: false
    });
  } catch {
  } finally {
    inkInstance.exitAlternateScreen();
  }
  const htmlPath = join(skillDir, "year_in_review.html");
  if (await pathExists(htmlPath)) {
    const platform = getPlatform();
    const openCmd = platform === "macos" ? "open" : platform === "windows" ? "start" : "xdg-open";
    void execFileNoThrow(openCmd, [htmlPath]);
  }
  return {
    success: true,
    message: "Year in review animation complete!"
  };
}
function ThinkbackInstaller({
  onReady,
  onError
}) {
  const [state, setState] = useState({
    phase: "checking"
  });
  const [progressMessage, setProgressMessage] = useState("");
  useEffect(() => {
    async function checkAndInstall() {
      try {
        const knownMarketplaces = await loadKnownMarketplacesConfig();
        const marketplaceName = getMarketplaceName();
        const marketplaceRepo = getMarketplaceRepo();
        const pluginId = getPluginId();
        const marketplaceInstalled = marketplaceName in knownMarketplaces;
        const pluginAlreadyInstalled = isPluginInstalled(pluginId);
        if (!marketplaceInstalled) {
          setState({
            phase: "installing-marketplace"
          });
          logForDebugging(`Installing marketplace ${marketplaceRepo}`);
          await addMarketplaceSource({
            source: "github",
            repo: marketplaceRepo
          }, (message) => {
            setProgressMessage(message);
          });
          clearAllCaches();
          logForDebugging(`Marketplace ${marketplaceName} installed`);
        } else if (!pluginAlreadyInstalled) {
          setState({
            phase: "installing-marketplace"
          });
          setProgressMessage("Updating marketplace\u2026");
          logForDebugging(`Refreshing marketplace ${marketplaceName}`);
          await refreshMarketplace(marketplaceName, (message_0) => {
            setProgressMessage(message_0);
          });
          clearMarketplacesCache();
          clearAllCaches();
          logForDebugging(`Marketplace ${marketplaceName} refreshed`);
        }
        if (!pluginAlreadyInstalled) {
          setState({
            phase: "installing-plugin"
          });
          logForDebugging(`Installing plugin ${pluginId}`);
          const result = await installSelectedPlugins([pluginId]);
          if (result.failed.length > 0) {
            const errorMsg = result.failed.map((f) => `${f.name}: ${f.error}`).join(", ");
            throw new Error(`Failed to install plugin: ${errorMsg}`);
          }
          clearAllCaches();
          logForDebugging(`Plugin ${pluginId} installed`);
        } else {
          const {
            disabled
          } = await loadAllPlugins();
          const isDisabled = disabled.some((p) => p.name === "thinkback" || p.source?.includes(pluginId));
          if (isDisabled) {
            setState({
              phase: "enabling-plugin"
            });
            logForDebugging(`Enabling plugin ${pluginId}`);
            const enableResult = await enablePluginOp(pluginId);
            if (!enableResult.success) {
              throw new Error(`Failed to enable plugin: ${enableResult.message}`);
            }
            clearAllCaches();
            logForDebugging(`Plugin ${pluginId} enabled`);
          }
        }
        setState({
          phase: "ready"
        });
        onReady();
      } catch (error) {
        const err = toError(error);
        logError(err);
        setState({
          phase: "error",
          message: err.message
        });
        onError(err.message);
      }
    }
    void checkAndInstall();
  }, [onReady, onError]);
  if (state.phase === "error") {
    return /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: /* @__PURE__ */ jsxs(Text, { color: "error", children: [
      "Error: ",
      state.message
    ] }) });
  }
  if (state.phase === "ready") {
    return null;
  }
  const statusMessage = state.phase === "checking" ? "Checking thinkback installation\u2026" : state.phase === "installing-marketplace" ? "Installing marketplace\u2026" : state.phase === "enabling-plugin" ? "Enabling thinkback plugin\u2026" : "Installing thinkback plugin\u2026";
  return /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: /* @__PURE__ */ jsxs(Box, { children: [
    /* @__PURE__ */ jsx(Spinner, {}),
    /* @__PURE__ */ jsx(Text, { children: progressMessage || statusMessage })
  ] }) });
}
function ThinkbackMenu(t0) {
  const $ = _c(19);
  const {
    onDone,
    onAction,
    skillDir,
    hasGenerated
  } = t0;
  const [hasSelected, setHasSelected] = useState(false);
  let t1;
  if ($[0] !== hasGenerated) {
    t1 = hasGenerated ? [{
      label: "Play animation",
      value: "play",
      description: "Watch your year in review"
    }, {
      label: "Edit content",
      value: "edit",
      description: "Modify the animation"
    }, {
      label: "Fix errors",
      value: "fix",
      description: "Fix validation or rendering issues"
    }, {
      label: "Regenerate",
      value: "regenerate",
      description: "Create a new animation from scratch"
    }] : [{
      label: "Let's go!",
      value: "regenerate",
      description: "Generate your personalized animation"
    }];
    $[0] = hasGenerated;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const options = t1;
  let t2;
  if ($[2] !== onAction || $[3] !== onDone || $[4] !== skillDir) {
    t2 = function handleSelect2(value) {
      setHasSelected(true);
      if (value === "play") {
        playAnimation(skillDir).then(() => {
          onDone(void 0, {
            display: "skip"
          });
        });
      } else {
        onAction(value);
      }
    };
    $[2] = onAction;
    $[3] = onDone;
    $[4] = skillDir;
    $[5] = t2;
  } else {
    t2 = $[5];
  }
  const handleSelect = t2;
  let t3;
  if ($[6] !== onDone) {
    t3 = function handleCancel2() {
      onDone(void 0, {
        display: "skip"
      });
    };
    $[6] = onDone;
    $[7] = t3;
  } else {
    t3 = $[7];
  }
  const handleCancel = t3;
  if (hasSelected) {
    return null;
  }
  let t4;
  if ($[8] !== hasGenerated) {
    t4 = !hasGenerated && /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx(Text, { children: "Relive your year of coding with Claude." }),
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: "We'll create a personalized ASCII animation celebrating your journey." })
    ] });
    $[8] = hasGenerated;
    $[9] = t4;
  } else {
    t4 = $[9];
  }
  let t5;
  if ($[10] !== handleSelect || $[11] !== options) {
    t5 = /* @__PURE__ */ jsx(Select, { options, onChange: handleSelect, visibleOptionCount: 5 });
    $[10] = handleSelect;
    $[11] = options;
    $[12] = t5;
  } else {
    t5 = $[12];
  }
  let t6;
  if ($[13] !== t4 || $[14] !== t5) {
    t6 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
      t4,
      t5
    ] });
    $[13] = t4;
    $[14] = t5;
    $[15] = t6;
  } else {
    t6 = $[15];
  }
  let t7;
  if ($[16] !== handleCancel || $[17] !== t6) {
    t7 = /* @__PURE__ */ jsx(Dialog, { title: "Think Back on 2025 with Claude Code", subtitle: "Generate your 2025 Claude Code Think Back (takes a few minutes to run)", onCancel: handleCancel, color: "claude", children: t6 });
    $[16] = handleCancel;
    $[17] = t6;
    $[18] = t7;
  } else {
    t7 = $[18];
  }
  return t7;
}
const EDIT_PROMPT = 'Use the Skill tool to invoke the "thinkback" skill with mode=edit to modify my existing Claude Code year in review animation. Ask me what I want to change. When the animation is ready, tell the user to run /think-back again to play it.';
const FIX_PROMPT = 'Use the Skill tool to invoke the "thinkback" skill with mode=fix to fix validation or rendering errors in my existing Claude Code year in review animation. Run the validator, identify errors, and fix them. When the animation is ready, tell the user to run /think-back again to play it.';
const REGENERATE_PROMPT = 'Use the Skill tool to invoke the "thinkback" skill with mode=regenerate to create a completely new Claude Code year in review animation from scratch. Delete the existing animation and start fresh. When the animation is ready, tell the user to run /think-back again to play it.';
function ThinkbackFlow(t0) {
  const $ = _c(27);
  const {
    onDone
  } = t0;
  const [installComplete, setInstallComplete] = useState(false);
  const [installError, setInstallError] = useState(null);
  const [skillDir, setSkillDir] = useState(null);
  const [hasGenerated, setHasGenerated] = useState(null);
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = function handleReady2() {
      setInstallComplete(true);
    };
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const handleReady = t1;
  let t2;
  if ($[1] !== onDone) {
    t2 = (message) => {
      setInstallError(message);
      onDone(`Error with thinkback: ${message}. Try running /plugin to manually install the think-back plugin.`, {
        display: "system"
      });
    };
    $[1] = onDone;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  const handleError = t2;
  let t3;
  let t4;
  if ($[3] !== handleError || $[4] !== installComplete || $[5] !== installError || $[6] !== skillDir) {
    t3 = () => {
      if (installComplete && !skillDir && !installError) {
        getThinkbackSkillDir().then((dir) => {
          if (dir) {
            logForDebugging(`Thinkback skill directory: ${dir}`);
            setSkillDir(dir);
          } else {
            handleError("Could not find thinkback skill directory");
          }
        });
      }
    };
    t4 = [installComplete, skillDir, installError, handleError];
    $[3] = handleError;
    $[4] = installComplete;
    $[5] = installError;
    $[6] = skillDir;
    $[7] = t3;
    $[8] = t4;
  } else {
    t3 = $[7];
    t4 = $[8];
  }
  useEffect(t3, t4);
  let t5;
  let t6;
  if ($[9] !== skillDir) {
    t5 = () => {
      if (!skillDir) {
        return;
      }
      const dataPath = join(skillDir, "year_in_review.js");
      pathExists(dataPath).then((exists) => {
        logForDebugging(`Checking for ${dataPath}: ${exists ? "found" : "not found"}`);
        setHasGenerated(exists);
      });
    };
    t6 = [skillDir];
    $[9] = skillDir;
    $[10] = t5;
    $[11] = t6;
  } else {
    t5 = $[10];
    t6 = $[11];
  }
  useEffect(t5, t6);
  let t7;
  if ($[12] !== onDone) {
    t7 = function handleAction2(action) {
      const prompts = {
        edit: EDIT_PROMPT,
        fix: FIX_PROMPT,
        regenerate: REGENERATE_PROMPT
      };
      onDone(prompts[action], {
        display: "user",
        shouldQuery: true
      });
    };
    $[12] = onDone;
    $[13] = t7;
  } else {
    t7 = $[13];
  }
  const handleAction = t7;
  if (installError) {
    let t82;
    if ($[14] !== installError) {
      t82 = /* @__PURE__ */ jsxs(Text, { color: "error", children: [
        "Error: ",
        installError
      ] });
      $[14] = installError;
      $[15] = t82;
    } else {
      t82 = $[15];
    }
    let t9;
    if ($[16] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t9 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Try running /plugin to manually install the think-back plugin." });
      $[16] = t9;
    } else {
      t9 = $[16];
    }
    let t10;
    if ($[17] !== t82) {
      t10 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        t82,
        t9
      ] });
      $[17] = t82;
      $[18] = t10;
    } else {
      t10 = $[18];
    }
    return t10;
  }
  if (!installComplete) {
    let t82;
    if ($[19] !== handleError) {
      t82 = /* @__PURE__ */ jsx(ThinkbackInstaller, { onReady: handleReady, onError: handleError });
      $[19] = handleError;
      $[20] = t82;
    } else {
      t82 = $[20];
    }
    return t82;
  }
  if (!skillDir || hasGenerated === null) {
    let t82;
    if ($[21] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t82 = /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Spinner, {}),
        /* @__PURE__ */ jsx(Text, { children: "Loading thinkback skill\u2026" })
      ] });
      $[21] = t82;
    } else {
      t82 = $[21];
    }
    return t82;
  }
  let t8;
  if ($[22] !== handleAction || $[23] !== hasGenerated || $[24] !== onDone || $[25] !== skillDir) {
    t8 = /* @__PURE__ */ jsx(ThinkbackMenu, { onDone, onAction: handleAction, skillDir, hasGenerated });
    $[22] = handleAction;
    $[23] = hasGenerated;
    $[24] = onDone;
    $[25] = skillDir;
    $[26] = t8;
  } else {
    t8 = $[26];
  }
  return t8;
}
async function call(onDone) {
  return /* @__PURE__ */ jsx(ThinkbackFlow, { onDone });
}
export {
  call,
  playAnimation
};
