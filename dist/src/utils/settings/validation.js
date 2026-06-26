import { jsonParse } from "../slowOperations.js";
import { plural } from "../stringUtils.js";
import { validatePermissionRule } from "./permissionValidation.js";
import { generateSettingsJSONSchema } from "./schemaOutput.js";
import { SettingsSchema } from "./types.js";
import { getValidationTip } from "./validationTips.js";
function isInvalidTypeIssue(issue) {
  return issue.code === "invalid_type";
}
function isInvalidValueIssue(issue) {
  return issue.code === "invalid_value";
}
function isUnrecognizedKeysIssue(issue) {
  return issue.code === "unrecognized_keys";
}
function isTooSmallIssue(issue) {
  return issue.code === "too_small";
}
function getReceivedType(value) {
  if (value === null) return "null";
  if (value === void 0) return "undefined";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
function extractReceivedFromMessage(msg) {
  const match = msg.match(/received (\w+)/);
  return match ? match[1] : void 0;
}
function formatZodError(error, filePath) {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    let message = issue.message;
    let expected;
    let enumValues;
    let expectedValue;
    let receivedValue;
    let invalidValue;
    if (isInvalidValueIssue(issue)) {
      enumValues = issue.values.map((v) => String(v));
      expectedValue = enumValues.join(" | ");
      receivedValue = void 0;
      invalidValue = void 0;
    } else if (isInvalidTypeIssue(issue)) {
      expectedValue = issue.expected;
      const receivedType = extractReceivedFromMessage(issue.message);
      receivedValue = receivedType ?? getReceivedType(issue.input);
      invalidValue = receivedType ?? getReceivedType(issue.input);
    } else if (isTooSmallIssue(issue)) {
      expectedValue = String(issue.minimum);
    } else if (issue.code === "custom" && "params" in issue) {
      const params = issue.params;
      receivedValue = params.received;
      invalidValue = receivedValue;
    }
    const tip = getValidationTip({
      path,
      code: issue.code,
      expected: expectedValue,
      received: receivedValue,
      enumValues,
      message: issue.message,
      value: receivedValue
    });
    if (isInvalidValueIssue(issue)) {
      expected = enumValues?.map((v) => `"${v}"`).join(", ");
      message = `Invalid value. Expected one of: ${expected}`;
    } else if (isInvalidTypeIssue(issue)) {
      const receivedType = extractReceivedFromMessage(issue.message) ?? getReceivedType(issue.input);
      if (issue.expected === "object" && receivedType === "null" && path === "") {
        message = "Invalid or malformed JSON";
      } else {
        message = `Expected ${issue.expected}, but received ${receivedType}`;
      }
    } else if (isUnrecognizedKeysIssue(issue)) {
      const keys = issue.keys.join(", ");
      message = `Unrecognized ${plural(issue.keys.length, "field")}: ${keys}`;
    } else if (isTooSmallIssue(issue)) {
      message = `Number must be greater than or equal to ${issue.minimum}`;
      expected = String(issue.minimum);
    }
    return {
      file: filePath,
      path,
      message,
      expected,
      invalidValue,
      suggestion: tip?.suggestion,
      docLink: tip?.docLink
    };
  });
}
function validateSettingsFileContent(content) {
  try {
    const jsonData = jsonParse(content);
    const result = SettingsSchema().strict().safeParse(jsonData);
    if (result.success) {
      return { isValid: true };
    }
    const errors = formatZodError(result.error, "settings");
    const errorMessage = "Settings validation failed:\n" + errors.map((err) => `- ${err.path}: ${err.message}`).join("\n");
    return {
      isValid: false,
      error: errorMessage,
      fullSchema: generateSettingsJSONSchema()
    };
  } catch (parseError) {
    return {
      isValid: false,
      error: `Invalid JSON: ${parseError instanceof Error ? parseError.message : "Unknown parsing error"}`,
      fullSchema: generateSettingsJSONSchema()
    };
  }
}
function filterInvalidPermissionRules(data, filePath) {
  if (!data || typeof data !== "object") return [];
  const obj = data;
  if (!obj.permissions || typeof obj.permissions !== "object") return [];
  const perms = obj.permissions;
  const warnings = [];
  for (const key of ["allow", "deny", "ask"]) {
    const rules = perms[key];
    if (!Array.isArray(rules)) continue;
    perms[key] = rules.filter((rule) => {
      if (typeof rule !== "string") {
        warnings.push({
          file: filePath,
          path: `permissions.${key}`,
          message: `Non-string value in ${key} array was removed`,
          invalidValue: rule
        });
        return false;
      }
      const result = validatePermissionRule(rule);
      if (!result.valid) {
        let message = `Invalid permission rule "${rule}" was skipped`;
        if (result.error) message += `: ${result.error}`;
        if (result.suggestion) message += `. ${result.suggestion}`;
        warnings.push({
          file: filePath,
          path: `permissions.${key}`,
          message,
          invalidValue: rule
        });
        return false;
      }
      return true;
    });
  }
  return warnings;
}
export {
  filterInvalidPermissionRules,
  formatZodError,
  validateSettingsFileContent
};
