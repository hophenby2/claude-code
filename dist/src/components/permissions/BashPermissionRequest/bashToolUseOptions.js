import { BASH_TOOL_NAME } from "../../../tools/BashTool/toolName.js";
import { extractOutputRedirections } from "../../../utils/bash/commands.js";
import "../../../utils/permissions/bashClassifier.js";
import { shouldShowAlwaysAllowOptions } from "../../../utils/permissions/permissionsLoader.js";
import { generateShellSuggestionsLabel } from "../shellPermissionHelpers.js";
function descriptionAlreadyExists(description, existingDescriptions) {
  const normalized = description.toLowerCase().trimEnd();
  return existingDescriptions.some((existing) => existing.toLowerCase().trimEnd() === normalized);
}
function stripBashRedirections(command) {
  const {
    commandWithoutRedirections,
    redirections
  } = extractOutputRedirections(command);
  return redirections.length > 0 ? commandWithoutRedirections : command;
}
function bashToolUseOptions({
  suggestions = [],
  decisionReason,
  onRejectFeedbackChange,
  onAcceptFeedbackChange,
  onClassifierDescriptionChange,
  classifierDescription,
  initialClassifierDescriptionEmpty = false,
  existingAllowDescriptions = [],
  yesInputMode = false,
  noInputMode = false,
  editablePrefix,
  onEditablePrefixChange
}) {
  const options = [];
  if (yesInputMode) {
    options.push({
      type: "input",
      label: "Yes",
      value: "yes",
      placeholder: "and tell Claude what to do next",
      onChange: onAcceptFeedbackChange,
      allowEmptySubmitToCancel: true
    });
  } else {
    options.push({
      label: "Yes",
      value: "yes"
    });
  }
  if (shouldShowAlwaysAllowOptions()) {
    const hasNonBashSuggestions = suggestions.some((s) => s.type === "addDirectories" || s.type === "addRules" && s.rules?.some((r) => r.toolName !== BASH_TOOL_NAME));
    if (editablePrefix !== void 0 && onEditablePrefixChange && !hasNonBashSuggestions && suggestions.length > 0) {
      options.push({
        type: "input",
        label: "Yes, and don\u2019t ask again for",
        value: "yes-prefix-edited",
        placeholder: "command prefix (e.g., npm run:*)",
        initialValue: editablePrefix,
        onChange: onEditablePrefixChange,
        allowEmptySubmitToCancel: true,
        showLabelWithValue: true,
        labelValueSeparator: ": ",
        resetCursorOnUpdate: true
      });
    } else if (suggestions.length > 0) {
      const label = generateShellSuggestionsLabel(suggestions, BASH_TOOL_NAME, stripBashRedirections);
      if (label) {
        options.push({
          label,
          value: "yes-apply-suggestions"
        });
      }
    }
    const editablePrefixShown = options.some((o) => o.value === "yes-prefix-edited");
    if (false) {
      options.push({
        type: "input",
        label: "Yes, and don\u2019t ask again for",
        value: "yes-classifier-reviewed",
        placeholder: "describe what to allow...",
        initialValue: classifierDescription ?? "",
        onChange: onClassifierDescriptionChange,
        allowEmptySubmitToCancel: true,
        showLabelWithValue: true,
        labelValueSeparator: ": ",
        resetCursorOnUpdate: true
      });
    }
  }
  if (noInputMode) {
    options.push({
      type: "input",
      label: "No",
      value: "no",
      placeholder: "and tell Claude what to do differently",
      onChange: onRejectFeedbackChange,
      allowEmptySubmitToCancel: true
    });
  } else {
    options.push({
      label: "No",
      value: "no"
    });
  }
  return options;
}
export {
  bashToolUseOptions
};
