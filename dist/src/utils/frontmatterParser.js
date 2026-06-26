import { logForDebugging } from "./debug.js";
import { parseYaml } from "./yaml.js";
const YAML_SPECIAL_CHARS = /[{}[\]*&#!|>%@`]|: /;
function quoteProblematicValues(frontmatterText) {
  const lines = frontmatterText.split("\n");
  const result = [];
  for (const line of lines) {
    const match = line.match(/^([a-zA-Z_-]+):\s+(.+)$/);
    if (match) {
      const [, key, value] = match;
      if (!key || !value) {
        result.push(line);
        continue;
      }
      if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
        result.push(line);
        continue;
      }
      if (YAML_SPECIAL_CHARS.test(value)) {
        const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        result.push(`${key}: "${escaped}"`);
        continue;
      }
    }
    result.push(line);
  }
  return result.join("\n");
}
const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)---\s*\n?/;
function parseFrontmatter(markdown, sourcePath) {
  const match = markdown.match(FRONTMATTER_REGEX);
  if (!match) {
    return {
      frontmatter: {},
      content: markdown
    };
  }
  const frontmatterText = match[1] || "";
  const content = markdown.slice(match[0].length);
  let frontmatter = {};
  try {
    const parsed = parseYaml(frontmatterText);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      frontmatter = parsed;
    }
  } catch {
    try {
      const quotedText = quoteProblematicValues(frontmatterText);
      const parsed = parseYaml(quotedText);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        frontmatter = parsed;
      }
    } catch (retryError) {
      const location = sourcePath ? ` in ${sourcePath}` : "";
      logForDebugging(
        `Failed to parse YAML frontmatter${location}: ${retryError instanceof Error ? retryError.message : retryError}`,
        { level: "warn" }
      );
    }
  }
  return {
    frontmatter,
    content
  };
}
function splitPathInFrontmatter(input) {
  if (Array.isArray(input)) {
    return input.flatMap(splitPathInFrontmatter);
  }
  if (typeof input !== "string") {
    return [];
  }
  const parts = [];
  let current = "";
  let braceDepth = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === "{") {
      braceDepth++;
      current += char;
    } else if (char === "}") {
      braceDepth--;
      current += char;
    } else if (char === "," && braceDepth === 0) {
      const trimmed2 = current.trim();
      if (trimmed2) {
        parts.push(trimmed2);
      }
      current = "";
    } else {
      current += char;
    }
  }
  const trimmed = current.trim();
  if (trimmed) {
    parts.push(trimmed);
  }
  return parts.filter((p) => p.length > 0).flatMap((pattern) => expandBraces(pattern));
}
function expandBraces(pattern) {
  const braceMatch = pattern.match(/^([^{]*)\{([^}]+)\}(.*)$/);
  if (!braceMatch) {
    return [pattern];
  }
  const prefix = braceMatch[1] || "";
  const alternatives = braceMatch[2] || "";
  const suffix = braceMatch[3] || "";
  const parts = alternatives.split(",").map((alt) => alt.trim());
  const expanded = [];
  for (const part of parts) {
    const combined = prefix + part + suffix;
    const furtherExpanded = expandBraces(combined);
    expanded.push(...furtherExpanded);
  }
  return expanded;
}
function parsePositiveIntFromFrontmatter(value) {
  if (value === void 0 || value === null) {
    return void 0;
  }
  const parsed = typeof value === "number" ? value : parseInt(String(value), 10);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return void 0;
}
function coerceDescriptionToString(value, componentName, pluginName) {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  const source = pluginName ? `${pluginName}:${componentName}` : componentName ?? "unknown";
  logForDebugging(`Description invalid for ${source} - omitting`, {
    level: "warn"
  });
  return null;
}
function parseBooleanFrontmatter(value) {
  return value === true || value === "true";
}
const FRONTMATTER_SHELLS = ["bash", "powershell"];
function parseShellFrontmatter(value, source) {
  if (value == null) {
    return void 0;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "") {
    return void 0;
  }
  if (FRONTMATTER_SHELLS.includes(normalized)) {
    return normalized;
  }
  logForDebugging(
    `Frontmatter 'shell: ${value}' in ${source} is not recognized. Valid values: ${FRONTMATTER_SHELLS.join(", ")}. Falling back to bash.`,
    { level: "warn" }
  );
  return void 0;
}
export {
  FRONTMATTER_REGEX,
  coerceDescriptionToString,
  parseBooleanFrontmatter,
  parseFrontmatter,
  parsePositiveIntFromFrontmatter,
  parseShellFrontmatter,
  splitPathInFrontmatter
};
