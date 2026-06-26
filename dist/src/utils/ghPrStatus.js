import { execFileNoThrow } from "./execFileNoThrow.js";
import { getBranch, getDefaultBranch, getIsGit } from "./git.js";
import { jsonParse } from "./slowOperations.js";
const GH_TIMEOUT_MS = 5e3;
function deriveReviewState(isDraft, reviewDecision) {
  if (isDraft) return "draft";
  switch (reviewDecision) {
    case "APPROVED":
      return "approved";
    case "CHANGES_REQUESTED":
      return "changes_requested";
    default:
      return "pending";
  }
}
async function fetchPrStatus() {
  const isGit = await getIsGit();
  if (!isGit) return null;
  const [branch, defaultBranch] = await Promise.all([
    getBranch(),
    getDefaultBranch()
  ]);
  if (branch === defaultBranch) return null;
  const { stdout, code } = await execFileNoThrow(
    "gh",
    [
      "pr",
      "view",
      "--json",
      "number,url,reviewDecision,isDraft,headRefName,state"
    ],
    { timeout: GH_TIMEOUT_MS, preserveOutputOnError: false }
  );
  if (code !== 0 || !stdout.trim()) return null;
  try {
    const data = jsonParse(stdout);
    if (data.headRefName === defaultBranch || data.headRefName === "main" || data.headRefName === "master") {
      return null;
    }
    if (data.state === "MERGED" || data.state === "CLOSED") {
      return null;
    }
    return {
      number: data.number,
      url: data.url,
      reviewState: deriveReviewState(data.isDraft, data.reviewDecision)
    };
  } catch {
    return null;
  }
}
export {
  deriveReviewState,
  fetchPrStatus
};
