import memoize from "lodash-es/memoize.js";
import { join } from "path";
import {
  getCurrentProjectConfig,
  saveCurrentProjectConfig
} from "./utils/config.js";
import { getCwd } from "./utils/cwd.js";
import { isDirEmpty } from "./utils/file.js";
import { getFsImplementation } from "./utils/fsOperations.js";
function getSteps() {
  const hasClaudeMd = getFsImplementation().existsSync(
    join(getCwd(), "CLAUDE.md")
  );
  const isWorkspaceDirEmpty = isDirEmpty(getCwd());
  return [
    {
      key: "workspace",
      text: "Ask Claude to create a new app or clone a repository",
      isComplete: false,
      isCompletable: true,
      isEnabled: isWorkspaceDirEmpty
    },
    {
      key: "claudemd",
      text: "Run /init to create a CLAUDE.md file with instructions for Claude",
      isComplete: hasClaudeMd,
      isCompletable: true,
      isEnabled: !isWorkspaceDirEmpty
    }
  ];
}
function isProjectOnboardingComplete() {
  return getSteps().filter(({ isCompletable, isEnabled }) => isCompletable && isEnabled).every(({ isComplete }) => isComplete);
}
function maybeMarkProjectOnboardingComplete() {
  if (getCurrentProjectConfig().hasCompletedProjectOnboarding) {
    return;
  }
  if (isProjectOnboardingComplete()) {
    saveCurrentProjectConfig((current) => ({
      ...current,
      hasCompletedProjectOnboarding: true
    }));
  }
}
const shouldShowProjectOnboarding = memoize(() => {
  const projectConfig = getCurrentProjectConfig();
  if (projectConfig.hasCompletedProjectOnboarding || projectConfig.projectOnboardingSeenCount >= 4 || process.env.IS_DEMO) {
    return false;
  }
  return !isProjectOnboardingComplete();
});
function incrementProjectOnboardingSeenCount() {
  saveCurrentProjectConfig((current) => ({
    ...current,
    projectOnboardingSeenCount: current.projectOnboardingSeenCount + 1
  }));
}
export {
  getSteps,
  incrementProjectOnboardingSeenCount,
  isProjectOnboardingComplete,
  maybeMarkProjectOnboardingComplete,
  shouldShowProjectOnboarding
};
