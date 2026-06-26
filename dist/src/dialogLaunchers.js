import { jsx } from "react/jsx-runtime";
import { renderAndRun, showSetupDialog } from "./interactiveHelpers.js";
import { KeybindingSetup } from "./keybindings/KeybindingProviderSetup.js";
async function launchSnapshotUpdateDialog(root, props) {
  const {
    SnapshotUpdateDialog
  } = await import("./components/agents/SnapshotUpdateDialog.js");
  return showSetupDialog(root, (done) => /* @__PURE__ */ jsx(SnapshotUpdateDialog, { agentType: props.agentType, scope: props.scope, snapshotTimestamp: props.snapshotTimestamp, onComplete: done, onCancel: () => done("keep") }));
}
async function launchInvalidSettingsDialog(root, props) {
  const {
    InvalidSettingsDialog
  } = await import("./components/InvalidSettingsDialog.js");
  return showSetupDialog(root, (done) => /* @__PURE__ */ jsx(InvalidSettingsDialog, { settingsErrors: props.settingsErrors, onContinue: done, onExit: props.onExit }));
}
async function launchAssistantSessionChooser(root, props) {
  const {
    AssistantSessionChooser
  } = await import("./assistant/AssistantSessionChooser.js");
  return showSetupDialog(root, (done) => /* @__PURE__ */ jsx(AssistantSessionChooser, { sessions: props.sessions, onSelect: (id) => done(id), onCancel: () => done(null) }));
}
async function launchAssistantInstallWizard(root) {
  const {
    NewInstallWizard,
    computeDefaultInstallDir
  } = await import("./commands/assistant/assistant.js");
  const defaultDir = await computeDefaultInstallDir();
  let rejectWithError;
  const errorPromise = new Promise((_, reject) => {
    rejectWithError = reject;
  });
  const resultPromise = showSetupDialog(root, (done) => /* @__PURE__ */ jsx(NewInstallWizard, { defaultDir, onInstalled: (dir) => done(dir), onCancel: () => done(null), onError: (message) => rejectWithError(new Error(`Installation failed: ${message}`)) }));
  return Promise.race([resultPromise, errorPromise]);
}
async function launchTeleportResumeWrapper(root) {
  const {
    TeleportResumeWrapper
  } = await import("./components/TeleportResumeWrapper.js");
  return showSetupDialog(root, (done) => /* @__PURE__ */ jsx(TeleportResumeWrapper, { onComplete: done, onCancel: () => done(null), source: "cliArg" }));
}
async function launchTeleportRepoMismatchDialog(root, props) {
  const {
    TeleportRepoMismatchDialog
  } = await import("./components/TeleportRepoMismatchDialog.js");
  return showSetupDialog(root, (done) => /* @__PURE__ */ jsx(TeleportRepoMismatchDialog, { targetRepo: props.targetRepo, initialPaths: props.initialPaths, onSelectPath: done, onCancel: () => done(null) }));
}
async function launchResumeChooser(root, appProps, worktreePathsPromise, resumeProps) {
  const [worktreePaths, {
    ResumeConversation
  }, {
    App
  }] = await Promise.all([worktreePathsPromise, import("./screens/ResumeConversation.js"), import("./components/App.js")]);
  await renderAndRun(root, /* @__PURE__ */ jsx(App, { getFpsMetrics: appProps.getFpsMetrics, stats: appProps.stats, initialState: appProps.initialState, children: /* @__PURE__ */ jsx(KeybindingSetup, { children: /* @__PURE__ */ jsx(ResumeConversation, { ...resumeProps, worktreePaths }) }) }));
}
export {
  launchAssistantInstallWizard,
  launchAssistantSessionChooser,
  launchInvalidSettingsDialog,
  launchResumeChooser,
  launchSnapshotUpdateDialog,
  launchTeleportRepoMismatchDialog,
  launchTeleportResumeWrapper
};
