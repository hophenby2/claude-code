const TOOL_VALIDATION_CONFIG = {
  // File pattern tools (accept *.ts, src/**, etc.)
  filePatternTools: [
    "Read",
    "Write",
    "Edit",
    "Glob",
    "NotebookRead",
    "NotebookEdit"
  ],
  // Bash wildcard tools (accept * anywhere, and legacy command:* syntax)
  bashPrefixTools: ["Bash"],
  // Custom validation (only if needed)
  customValidation: {
    // WebSearch doesn't support wildcards or complex patterns
    WebSearch: (content) => {
      if (content.includes("*") || content.includes("?")) {
        return {
          valid: false,
          error: "WebSearch does not support wildcards",
          suggestion: "Use exact search terms without * or ?",
          examples: ["WebSearch(claude ai)", "WebSearch(typescript tutorial)"]
        };
      }
      return { valid: true };
    },
    // WebFetch uses domain: prefix for hostname-based permissions
    WebFetch: (content) => {
      if (content.includes("://") || content.startsWith("http")) {
        return {
          valid: false,
          error: "WebFetch permissions use domain format, not URLs",
          suggestion: 'Use "domain:hostname" format',
          examples: [
            "WebFetch(domain:example.com)",
            "WebFetch(domain:github.com)"
          ]
        };
      }
      if (!content.startsWith("domain:")) {
        return {
          valid: false,
          error: 'WebFetch permissions must use "domain:" prefix',
          suggestion: 'Use "domain:hostname" format',
          examples: [
            "WebFetch(domain:example.com)",
            "WebFetch(domain:*.google.com)"
          ]
        };
      }
      return { valid: true };
    }
  }
};
function isFilePatternTool(toolName) {
  return TOOL_VALIDATION_CONFIG.filePatternTools.includes(toolName);
}
function isBashPrefixTool(toolName) {
  return TOOL_VALIDATION_CONFIG.bashPrefixTools.includes(toolName);
}
function getCustomValidation(toolName) {
  return TOOL_VALIDATION_CONFIG.customValidation[toolName];
}
export {
  TOOL_VALIDATION_CONFIG,
  getCustomValidation,
  isBashPrefixTool,
  isFilePatternTool
};
