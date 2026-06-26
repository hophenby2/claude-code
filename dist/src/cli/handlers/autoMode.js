import { errorMessage } from "../../utils/errors.js";
import {
  getMainLoopModel,
  parseUserSpecifiedModel
} from "../../utils/model/model.js";
import {
  buildDefaultExternalSystemPrompt,
  getDefaultExternalAutoModeRules
} from "../../utils/permissions/yoloClassifier.js";
import { getAutoModeConfig } from "../../utils/settings/settings.js";
import { sideQuery } from "../../utils/sideQuery.js";
import { jsonStringify } from "../../utils/slowOperations.js";
function writeRules(rules) {
  process.stdout.write(jsonStringify(rules, null, 2) + "\n");
}
function autoModeDefaultsHandler() {
  writeRules(getDefaultExternalAutoModeRules());
}
function autoModeConfigHandler() {
  const config = getAutoModeConfig();
  const defaults = getDefaultExternalAutoModeRules();
  writeRules({
    allow: config?.allow?.length ? config.allow : defaults.allow,
    soft_deny: config?.soft_deny?.length ? config.soft_deny : defaults.soft_deny,
    environment: config?.environment?.length ? config.environment : defaults.environment
  });
}
const CRITIQUE_SYSTEM_PROMPT = `You are an expert reviewer of auto mode classifier rules for Claude Code.

Claude Code has an "auto mode" that uses an AI classifier to decide whether tool calls should be auto-approved or require user confirmation. Users can write custom rules in three categories:

- **allow**: Actions the classifier should auto-approve
- **soft_deny**: Actions the classifier should block (require user confirmation)
- **environment**: Context about the user's setup that helps the classifier make decisions

Your job is to critique the user's custom rules for clarity, completeness, and potential issues. The classifier is an LLM that reads these rules as part of its system prompt.

For each rule, evaluate:
1. **Clarity**: Is the rule unambiguous? Could the classifier misinterpret it?
2. **Completeness**: Are there gaps or edge cases the rule doesn't cover?
3. **Conflicts**: Do any of the rules conflict with each other?
4. **Actionability**: Is the rule specific enough for the classifier to act on?

Be concise and constructive. Only comment on rules that could be improved. If all rules look good, say so.`;
async function autoModeCritiqueHandler(options) {
  const config = getAutoModeConfig();
  const hasCustomRules = (config?.allow?.length ?? 0) > 0 || (config?.soft_deny?.length ?? 0) > 0 || (config?.environment?.length ?? 0) > 0;
  if (!hasCustomRules) {
    process.stdout.write(
      "No custom auto mode rules found.\n\nAdd rules to your settings file under autoMode.{allow, soft_deny, environment}.\nRun `claude auto-mode defaults` to see the default rules for reference.\n"
    );
    return;
  }
  const model = options.model ? parseUserSpecifiedModel(options.model) : getMainLoopModel();
  const defaults = getDefaultExternalAutoModeRules();
  const classifierPrompt = buildDefaultExternalSystemPrompt();
  const userRulesSummary = formatRulesForCritique("allow", config?.allow ?? [], defaults.allow) + formatRulesForCritique(
    "soft_deny",
    config?.soft_deny ?? [],
    defaults.soft_deny
  ) + formatRulesForCritique(
    "environment",
    config?.environment ?? [],
    defaults.environment
  );
  process.stdout.write("Analyzing your auto mode rules\u2026\n\n");
  let response;
  try {
    response = await sideQuery({
      querySource: "auto_mode_critique",
      model,
      system: CRITIQUE_SYSTEM_PROMPT,
      skipSystemPromptPrefix: true,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: "Here is the full classifier system prompt that the auto mode classifier receives:\n\n<classifier_system_prompt>\n" + classifierPrompt + "\n</classifier_system_prompt>\n\nHere are the user's custom rules that REPLACE the corresponding default sections:\n\n" + userRulesSummary + "\nPlease critique these custom rules."
        }
      ]
    });
  } catch (error) {
    process.stderr.write(
      "Failed to analyze rules: " + errorMessage(error) + "\n"
    );
    process.exitCode = 1;
    return;
  }
  const textBlock = response.content.find((block) => block.type === "text");
  if (textBlock?.type === "text") {
    process.stdout.write(textBlock.text + "\n");
  } else {
    process.stdout.write("No critique was generated. Please try again.\n");
  }
}
function formatRulesForCritique(section, userRules, defaultRules) {
  if (userRules.length === 0) return "";
  const customLines = userRules.map((r) => "- " + r).join("\n");
  const defaultLines = defaultRules.map((r) => "- " + r).join("\n");
  return "## " + section + " (custom rules replacing defaults)\nCustom:\n" + customLines + "\n\nDefaults being replaced:\n" + defaultLines + "\n\n";
}
export {
  autoModeConfigHandler,
  autoModeCritiqueHandler,
  autoModeDefaultsHandler
};
