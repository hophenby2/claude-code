import { findGitRoot } from "../git.js";
function projectIsInGitRepo(cwd) {
  return findGitRoot(cwd) !== null;
}
export {
  projectIsInGitRepo
};
