import { readdir } from "fs/promises";
import { getCwd } from "../../utils/cwd.js";
import { registerBundledSkill } from "../bundledSkills.js";
const LANGUAGE_INDICATORS = {
  python: [".py", "requirements.txt", "pyproject.toml", "setup.py", "Pipfile"],
  typescript: [".ts", ".tsx", "tsconfig.json", "package.json"],
  java: [".java", "pom.xml", "build.gradle"],
  go: [".go", "go.mod"],
  ruby: [".rb", "Gemfile"],
  csharp: [".cs", ".csproj"],
  php: [".php", "composer.json"],
  curl: []
};
async function detectLanguage() {
  const cwd = getCwd();
  let entries;
  try {
    entries = await readdir(cwd);
  } catch {
    return null;
  }
  for (const [lang, indicators] of Object.entries(LANGUAGE_INDICATORS)) {
    if (indicators.length === 0) continue;
    for (const indicator of indicators) {
      if (indicator.startsWith(".")) {
        if (entries.some((e) => e.endsWith(indicator))) return lang;
      } else {
        if (entries.includes(indicator)) return lang;
      }
    }
  }
  return null;
}
function getFilesForLanguage(lang, content) {
  return Object.keys(content.SKILL_FILES).filter(
    (path) => path.startsWith(`${lang}/`) || path.startsWith("shared/")
  );
}
function processContent(md, content) {
  let out = md;
  let prev;
  do {
    prev = out;
    out = out.replace(/<!--[\s\S]*?-->\n?/g, "");
  } while (out !== prev);
  out = out.replace(
    /\{\{(\w+)\}\}/g,
    (match, key) => content.SKILL_MODEL_VARS[key] ?? match
  );
  return out;
}
function buildInlineReference(filePaths, content) {
  const sections = [];
  for (const filePath of filePaths.sort()) {
    const md = content.SKILL_FILES[filePath];
    if (!md) continue;
    sections.push(
      `<doc path="${filePath}">
${processContent(md, content).trim()}
</doc>`
    );
  }
  return sections.join("\n\n");
}
const INLINE_READING_GUIDE = `## Reference Documentation

The relevant documentation for your detected language is included below in \`<doc>\` tags. Each tag has a \`path\` attribute showing its original file path. Use this to find the right section:

### Quick Task Reference

**Single text classification/summarization/extraction/Q&A:**
\u2192 Refer to \`{lang}/claude-api/README.md\`

**Chat UI or real-time response display:**
\u2192 Refer to \`{lang}/claude-api/README.md\` + \`{lang}/claude-api/streaming.md\`

**Long-running conversations (may exceed context window):**
\u2192 Refer to \`{lang}/claude-api/README.md\` \u2014 see Compaction section

**Prompt caching / optimize caching / "why is my cache hit rate low":**
\u2192 Refer to \`shared/prompt-caching.md\` + \`{lang}/claude-api/README.md\` (Prompt Caching section)

**Function calling / tool use / agents:**
\u2192 Refer to \`{lang}/claude-api/README.md\` + \`shared/tool-use-concepts.md\` + \`{lang}/claude-api/tool-use.md\`

**Batch processing (non-latency-sensitive):**
\u2192 Refer to \`{lang}/claude-api/README.md\` + \`{lang}/claude-api/batches.md\`

**File uploads across multiple requests:**
\u2192 Refer to \`{lang}/claude-api/README.md\` + \`{lang}/claude-api/files-api.md\`

**Agent with built-in tools (file/web/terminal) (Python & TypeScript only):**
\u2192 Refer to \`{lang}/agent-sdk/README.md\` + \`{lang}/agent-sdk/patterns.md\`

**Error handling:**
\u2192 Refer to \`shared/error-codes.md\`

**Latest docs via WebFetch:**
\u2192 Refer to \`shared/live-sources.md\` for URLs`;
function buildPrompt(lang, args, content) {
  const cleanPrompt = processContent(content.SKILL_PROMPT, content);
  const readingGuideIdx = cleanPrompt.indexOf("## Reading Guide");
  const basePrompt = readingGuideIdx !== -1 ? cleanPrompt.slice(0, readingGuideIdx).trimEnd() : cleanPrompt;
  const parts = [basePrompt];
  if (lang) {
    const filePaths = getFilesForLanguage(lang, content);
    const readingGuide = INLINE_READING_GUIDE.replace(/\{lang\}/g, lang);
    parts.push(readingGuide);
    parts.push(
      "---\n\n## Included Documentation\n\n" + buildInlineReference(filePaths, content)
    );
  } else {
    parts.push(INLINE_READING_GUIDE.replace(/\{lang\}/g, "unknown"));
    parts.push(
      "No project language was auto-detected. Ask the user which language they are using, then refer to the matching docs below."
    );
    parts.push(
      "---\n\n## Included Documentation\n\n" + buildInlineReference(Object.keys(content.SKILL_FILES), content)
    );
  }
  const webFetchIdx = cleanPrompt.indexOf("## When to Use WebFetch");
  if (webFetchIdx !== -1) {
    parts.push(cleanPrompt.slice(webFetchIdx).trimEnd());
  }
  if (args) {
    parts.push(`## User Request

${args}`);
  }
  return parts.join("\n\n");
}
function registerClaudeApiSkill() {
  registerBundledSkill({
    name: "claude-api",
    description: "Build apps with the Claude API or Anthropic SDK.\nTRIGGER when: code imports `anthropic`/`@anthropic-ai/sdk`/`claude_agent_sdk`, or user asks to use Claude API, Anthropic SDKs, or Agent SDK.\nDO NOT TRIGGER when: code imports `openai`/other AI SDK, general programming, or ML/data-science tasks.",
    allowedTools: ["Read", "Grep", "Glob", "WebFetch"],
    userInvocable: true,
    async getPromptForCommand(args) {
      const content = await import("./claudeApiContent.js");
      const lang = await detectLanguage();
      const prompt = buildPrompt(lang, args, content);
      return [{ type: "text", text: prompt }];
    }
  });
}
export {
  registerClaudeApiSkill
};
