import { isUltrareviewEnabled } from "./review/ultrareviewEnabled.js";
const CCR_TERMS_URL = "https://code.claude.com/docs/en/claude-code-on-the-web";
const LOCAL_REVIEW_PROMPT = (args) => `
      You are an expert code reviewer. Follow these steps:

      1. If no PR number is provided in the args, run \`gh pr list\` to show open PRs
      2. If a PR number is provided, run \`gh pr view <number>\` to get PR details
      3. Run \`gh pr diff <number>\` to get the diff
      4. Analyze the changes and provide a thorough code review that includes:
         - Overview of what the PR does
         - Analysis of code quality and style
         - Specific suggestions for improvements
         - Any potential issues or risks

      Keep your review concise but thorough. Focus on:
      - Code correctness
      - Following project conventions
      - Performance implications
      - Test coverage
      - Security considerations

      Format your review with clear sections and bullet points.

      PR number: ${args}
    `;
const review = {
  type: "prompt",
  name: "review",
  description: "Review a pull request",
  progressMessage: "reviewing pull request",
  contentLength: 0,
  source: "builtin",
  async getPromptForCommand(args) {
    return [{ type: "text", text: LOCAL_REVIEW_PROMPT(args) }];
  }
};
const ultrareview = {
  type: "local-jsx",
  name: "ultrareview",
  description: `~10\u201320 min \xB7 Finds and verifies bugs in your branch. Runs in Claude Code on the web. See ${CCR_TERMS_URL}`,
  isEnabled: () => isUltrareviewEnabled(),
  load: () => import("./review/ultrareviewCommand.js")
};
var review_default = review;
export {
  review_default as default,
  ultrareview
};
