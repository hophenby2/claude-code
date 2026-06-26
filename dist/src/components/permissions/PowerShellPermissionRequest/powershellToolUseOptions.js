import { POWERSHELL_TOOL_NAME } from "../../../tools/PowerShellTool/toolName.js";
import { shouldShowAlwaysAllowOptions } from "../../../utils/permissions/permissionsLoader.js";
import { generateShellSuggestionsLabel } from "../shellPermissionHelpers.js";
function powershellToolUseOptions({
  suggestions = [],
  onRejectFeedbackChange,
  onAcceptFeedbackChange,
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
  if (shouldShowAlwaysAllowOptions() && suggestions.length > 0) {
    const hasNonPowerShellSuggestions = suggestions.some((s) => s.type === "addDirectories" || s.type === "addRules" && s.rules?.some((r) => r.toolName !== POWERSHELL_TOOL_NAME));
    if (editablePrefix !== void 0 && onEditablePrefixChange && !hasNonPowerShellSuggestions) {
      options.push({
        type: "input",
        label: "Yes, and don\u2019t ask again for",
        value: "yes-prefix-edited",
        placeholder: "command prefix (e.g., Get-Process:*)",
        initialValue: editablePrefix,
        onChange: onEditablePrefixChange,
        allowEmptySubmitToCancel: true,
        showLabelWithValue: true,
        labelValueSeparator: ": ",
        resetCursorOnUpdate: true
      });
    } else {
      const label = generateShellSuggestionsLabel(suggestions, POWERSHELL_TOOL_NAME);
      if (label) {
        options.push({
          label,
          value: "yes-apply-suggestions"
        });
      }
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
  powershellToolUseOptions
};
