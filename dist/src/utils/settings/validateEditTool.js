import { isClaudeSettingsPath } from "../permissions/filesystem.js";
import { validateSettingsFileContent } from "./validation.js";
function validateInputForSettingsFileEdit(filePath, originalContent, getUpdatedContent) {
  if (!isClaudeSettingsPath(filePath)) {
    return null;
  }
  const beforeValidation = validateSettingsFileContent(originalContent);
  if (!beforeValidation.isValid) {
    return null;
  }
  const updatedContent = getUpdatedContent();
  const afterValidation = validateSettingsFileContent(updatedContent);
  if (!afterValidation.isValid) {
    return {
      result: false,
      message: `Claude Code settings.json validation failed after edit:
${afterValidation.error}

Full schema:
${afterValidation.fullSchema}
IMPORTANT: Do not update the env unless explicitly instructed to do so.`,
      errorCode: 10
    };
  }
  return null;
}
export {
  validateInputForSettingsFileEdit
};
