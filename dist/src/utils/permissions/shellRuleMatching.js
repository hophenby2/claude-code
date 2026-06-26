const ESCAPED_STAR_PLACEHOLDER = "\0ESCAPED_STAR\0";
const ESCAPED_BACKSLASH_PLACEHOLDER = "\0ESCAPED_BACKSLASH\0";
const ESCAPED_STAR_PLACEHOLDER_RE = new RegExp(ESCAPED_STAR_PLACEHOLDER, "g");
const ESCAPED_BACKSLASH_PLACEHOLDER_RE = new RegExp(
  ESCAPED_BACKSLASH_PLACEHOLDER,
  "g"
);
function permissionRuleExtractPrefix(permissionRule) {
  const match = permissionRule.match(/^(.+):\*$/);
  return match?.[1] ?? null;
}
function hasWildcards(pattern) {
  if (pattern.endsWith(":*")) {
    return false;
  }
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === "*") {
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && pattern[j] === "\\") {
        backslashCount++;
        j--;
      }
      if (backslashCount % 2 === 0) {
        return true;
      }
    }
  }
  return false;
}
function matchWildcardPattern(pattern, command, caseInsensitive = false) {
  const trimmedPattern = pattern.trim();
  let processed = "";
  let i = 0;
  while (i < trimmedPattern.length) {
    const char = trimmedPattern[i];
    if (char === "\\" && i + 1 < trimmedPattern.length) {
      const nextChar = trimmedPattern[i + 1];
      if (nextChar === "*") {
        processed += ESCAPED_STAR_PLACEHOLDER;
        i += 2;
        continue;
      } else if (nextChar === "\\") {
        processed += ESCAPED_BACKSLASH_PLACEHOLDER;
        i += 2;
        continue;
      }
    }
    processed += char;
    i++;
  }
  const escaped = processed.replace(/[.+?^${}()|[\]\\'"]/g, "\\$&");
  const withWildcards = escaped.replace(/\*/g, ".*");
  let regexPattern = withWildcards.replace(ESCAPED_STAR_PLACEHOLDER_RE, "\\*").replace(ESCAPED_BACKSLASH_PLACEHOLDER_RE, "\\\\");
  const unescapedStarCount = (processed.match(/\*/g) || []).length;
  if (regexPattern.endsWith(" .*") && unescapedStarCount === 1) {
    regexPattern = regexPattern.slice(0, -3) + "( .*)?";
  }
  const flags = "s" + (caseInsensitive ? "i" : "");
  const regex = new RegExp(`^${regexPattern}$`, flags);
  return regex.test(command);
}
function parsePermissionRule(permissionRule) {
  const prefix = permissionRuleExtractPrefix(permissionRule);
  if (prefix !== null) {
    return {
      type: "prefix",
      prefix
    };
  }
  if (hasWildcards(permissionRule)) {
    return {
      type: "wildcard",
      pattern: permissionRule
    };
  }
  return {
    type: "exact",
    command: permissionRule
  };
}
function suggestionForExactCommand(toolName, command) {
  return [
    {
      type: "addRules",
      rules: [
        {
          toolName,
          ruleContent: command
        }
      ],
      behavior: "allow",
      destination: "localSettings"
    }
  ];
}
function suggestionForPrefix(toolName, prefix) {
  return [
    {
      type: "addRules",
      rules: [
        {
          toolName,
          ruleContent: `${prefix}:*`
        }
      ],
      behavior: "allow",
      destination: "localSettings"
    }
  ];
}
export {
  hasWildcards,
  matchWildcardPattern,
  parsePermissionRule,
  permissionRuleExtractPrefix,
  suggestionForExactCommand,
  suggestionForPrefix
};
