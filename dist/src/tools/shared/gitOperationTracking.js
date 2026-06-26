import { getCommitCounter, getPrCounter } from "../../bootstrap/state.js";
import {
  logEvent
} from "../../services/analytics/index.js";
function gitCmdRe(subcmd, suffix = "") {
  return new RegExp(
    `\\bgit(?:\\s+-[cC]\\s+\\S+|\\s+--\\S+=\\S+)*\\s+${subcmd}\\b${suffix}`
  );
}
const GIT_COMMIT_RE = gitCmdRe("commit");
const GIT_PUSH_RE = gitCmdRe("push");
const GIT_CHERRY_PICK_RE = gitCmdRe("cherry-pick");
const GIT_MERGE_RE = gitCmdRe("merge", "(?!-)");
const GIT_REBASE_RE = gitCmdRe("rebase");
const GH_PR_ACTIONS = [
  { re: /\bgh\s+pr\s+create\b/, action: "created", op: "pr_create" },
  { re: /\bgh\s+pr\s+edit\b/, action: "edited", op: "pr_edit" },
  { re: /\bgh\s+pr\s+merge\b/, action: "merged", op: "pr_merge" },
  { re: /\bgh\s+pr\s+comment\b/, action: "commented", op: "pr_comment" },
  { re: /\bgh\s+pr\s+close\b/, action: "closed", op: "pr_close" },
  { re: /\bgh\s+pr\s+ready\b/, action: "ready", op: "pr_ready" }
];
function parsePrUrl(url) {
  const match = url.match(/https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  if (match?.[1] && match?.[2]) {
    return {
      prNumber: parseInt(match[2], 10),
      prUrl: url,
      prRepository: match[1]
    };
  }
  return null;
}
function findPrInStdout(stdout) {
  const m = stdout.match(/https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/);
  return m ? parsePrUrl(m[0]) : null;
}
function parseGitCommitId(stdout) {
  const match = stdout.match(/\[[\w./-]+(?: \(root-commit\))? ([0-9a-f]+)\]/);
  return match?.[1];
}
function parseGitPushBranch(output) {
  const match = output.match(
    /^\s*[+\-*!= ]?\s*(?:\[new branch\]|\S+\.\.+\S+)\s+\S+\s*->\s*(\S+)/m
  );
  return match?.[1];
}
function parsePrNumberFromText(stdout) {
  const match = stdout.match(/[Pp]ull request (?:\S+#)?#?(\d+)/);
  return match?.[1] ? parseInt(match[1], 10) : void 0;
}
function parseRefFromCommand(command, verb) {
  const after = command.split(gitCmdRe(verb))[1];
  if (!after) return void 0;
  for (const t of after.trim().split(/\s+/)) {
    if (/^[&|;><]/.test(t)) break;
    if (t.startsWith("-")) continue;
    return t;
  }
  return void 0;
}
function detectGitOperation(command, output) {
  const result = {};
  const isCherryPick = GIT_CHERRY_PICK_RE.test(command);
  if (GIT_COMMIT_RE.test(command) || isCherryPick) {
    const sha = parseGitCommitId(output);
    if (sha) {
      result.commit = {
        sha: sha.slice(0, 6),
        kind: isCherryPick ? "cherry-picked" : /--amend\b/.test(command) ? "amended" : "committed"
      };
    }
  }
  if (GIT_PUSH_RE.test(command)) {
    const branch = parseGitPushBranch(output);
    if (branch) result.push = { branch };
  }
  if (GIT_MERGE_RE.test(command) && /(Fast-forward|Merge made by)/.test(output)) {
    const ref = parseRefFromCommand(command, "merge");
    if (ref) result.branch = { ref, action: "merged" };
  }
  if (GIT_REBASE_RE.test(command) && /Successfully rebased/.test(output)) {
    const ref = parseRefFromCommand(command, "rebase");
    if (ref) result.branch = { ref, action: "rebased" };
  }
  const prAction = GH_PR_ACTIONS.find((a) => a.re.test(command))?.action;
  if (prAction) {
    const pr = findPrInStdout(output);
    if (pr) {
      result.pr = { number: pr.prNumber, url: pr.prUrl, action: prAction };
    } else {
      const num = parsePrNumberFromText(output);
      if (num) result.pr = { number: num, action: prAction };
    }
  }
  return result;
}
function trackGitOperations(command, exitCode, stdout) {
  const success = exitCode === 0;
  if (!success) {
    return;
  }
  if (GIT_COMMIT_RE.test(command)) {
    logEvent("tengu_git_operation", {
      operation: "commit"
    });
    if (command.match(/--amend\b/)) {
      logEvent("tengu_git_operation", {
        operation: "commit_amend"
      });
    }
    getCommitCounter()?.add(1);
  }
  if (GIT_PUSH_RE.test(command)) {
    logEvent("tengu_git_operation", {
      operation: "push"
    });
  }
  const prHit = GH_PR_ACTIONS.find((a) => a.re.test(command));
  if (prHit) {
    logEvent("tengu_git_operation", {
      operation: prHit.op
    });
  }
  if (prHit?.action === "created") {
    getPrCounter()?.add(1);
    if (stdout) {
      const prInfo = findPrInStdout(stdout);
      if (prInfo) {
        void import("../../utils/sessionStorage.js").then(
          ({ linkSessionToPR }) => {
            void import("../../bootstrap/state.js").then(({ getSessionId }) => {
              const sessionId = getSessionId();
              if (sessionId) {
                void linkSessionToPR(
                  sessionId,
                  prInfo.prNumber,
                  prInfo.prUrl,
                  prInfo.prRepository
                );
              }
            });
          }
        );
      }
    }
  }
  if (command.match(/\bglab\s+mr\s+create\b/)) {
    logEvent("tengu_git_operation", {
      operation: "pr_create"
    });
    getPrCounter()?.add(1);
  }
  const isCurlPost = command.match(/\bcurl\b/) && (command.match(/-X\s*POST\b/i) || command.match(/--request\s*=?\s*POST\b/i) || command.match(/\s-d\s/));
  const isPrEndpoint = command.match(
    /https?:\/\/[^\s'"]*\/(pulls|pull-requests|merge[-_]requests)(?!\/\d)/i
  );
  if (isCurlPost && isPrEndpoint) {
    logEvent("tengu_git_operation", {
      operation: "pr_create"
    });
    getPrCounter()?.add(1);
  }
}
export {
  detectGitOperation,
  parseGitCommitId,
  trackGitOperations
};
