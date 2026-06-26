import memoize from "lodash-es/memoize.js";
import { basename } from "path";
import { logForDebugging } from "../utils/debug.js";
import { coerceDescriptionToString } from "../utils/frontmatterParser.js";
import { logError } from "../utils/log.js";
import {
  extractDescriptionFromMarkdown,
  loadMarkdownFilesForSubdir
} from "../utils/markdownConfigLoader.js";
import { clearPluginOutputStyleCache } from "../utils/plugins/loadPluginOutputStyles.js";
const getOutputStyleDirStyles = memoize(
  async (cwd) => {
    try {
      const markdownFiles = await loadMarkdownFilesForSubdir(
        "output-styles",
        cwd
      );
      const styles = markdownFiles.map(({ filePath, frontmatter, content, source }) => {
        try {
          const fileName = basename(filePath);
          const styleName = fileName.replace(/\.md$/, "");
          const name = frontmatter["name"] || styleName;
          const description = coerceDescriptionToString(
            frontmatter["description"],
            styleName
          ) ?? extractDescriptionFromMarkdown(
            content,
            `Custom ${styleName} output style`
          );
          const keepCodingInstructionsRaw = frontmatter["keep-coding-instructions"];
          const keepCodingInstructions = keepCodingInstructionsRaw === true || keepCodingInstructionsRaw === "true" ? true : keepCodingInstructionsRaw === false || keepCodingInstructionsRaw === "false" ? false : void 0;
          if (frontmatter["force-for-plugin"] !== void 0) {
            logForDebugging(
              `Output style "${name}" has force-for-plugin set, but this option only applies to plugin output styles. Ignoring.`,
              { level: "warn" }
            );
          }
          return {
            name,
            description,
            prompt: content.trim(),
            source,
            keepCodingInstructions
          };
        } catch (error) {
          logError(error);
          return null;
        }
      }).filter((style) => style !== null);
      return styles;
    } catch (error) {
      logError(error);
      return [];
    }
  }
);
function clearOutputStyleCaches() {
  getOutputStyleDirStyles.cache?.clear?.();
  loadMarkdownFilesForSubdir.cache?.clear?.();
  clearPluginOutputStyleCache();
}
export {
  clearOutputStyleCaches,
  getOutputStyleDirStyles
};
