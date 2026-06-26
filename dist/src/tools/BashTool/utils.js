import { readFile, stat } from "fs/promises";
import { getOriginalCwd } from "../../bootstrap/state.js";
import { logEvent } from "../../services/analytics/index.js";
import { getCwd } from "../../utils/cwd.js";
import { pathInAllowedWorkingPath } from "../../utils/permissions/filesystem.js";
import { setCwd } from "../../utils/Shell.js";
import { shouldMaintainProjectWorkingDir } from "../../utils/envUtils.js";
import { maybeResizeAndDownsampleImageBuffer } from "../../utils/imageResizer.js";
import { getMaxOutputLength } from "../../utils/shell/outputLimits.js";
import { countCharInString, plural } from "../../utils/stringUtils.js";
function stripEmptyLines(content) {
  const lines = content.split("\n");
  let startIndex = 0;
  while (startIndex < lines.length && lines[startIndex]?.trim() === "") {
    startIndex++;
  }
  let endIndex = lines.length - 1;
  while (endIndex >= 0 && lines[endIndex]?.trim() === "") {
    endIndex--;
  }
  if (startIndex > endIndex) {
    return "";
  }
  return lines.slice(startIndex, endIndex + 1).join("\n");
}
function isImageOutput(content) {
  return /^data:image\/[a-z0-9.+_-]+;base64,/i.test(content);
}
const DATA_URI_RE = /^data:([^;]+);base64,(.+)$/;
function parseDataUri(s) {
  const match = s.trim().match(DATA_URI_RE);
  if (!match || !match[1] || !match[2]) return null;
  return { mediaType: match[1], data: match[2] };
}
function buildImageToolResult(stdout, toolUseID) {
  const parsed = parseDataUri(stdout);
  if (!parsed) return null;
  return {
    tool_use_id: toolUseID,
    type: "tool_result",
    content: [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: parsed.mediaType,
          data: parsed.data
        }
      }
    ]
  };
}
const MAX_IMAGE_FILE_SIZE = 20 * 1024 * 1024;
async function resizeShellImageOutput(stdout, outputFilePath, outputFileSize) {
  let source = stdout;
  if (outputFilePath) {
    const size = outputFileSize ?? (await stat(outputFilePath)).size;
    if (size > MAX_IMAGE_FILE_SIZE) return null;
    source = await readFile(outputFilePath, "utf8");
  }
  const parsed = parseDataUri(source);
  if (!parsed) return null;
  const buf = Buffer.from(parsed.data, "base64");
  const ext = parsed.mediaType.split("/")[1] || "png";
  const resized = await maybeResizeAndDownsampleImageBuffer(
    buf,
    buf.length,
    ext
  );
  return `data:image/${resized.mediaType};base64,${resized.buffer.toString("base64")}`;
}
function formatOutput(content) {
  const isImage = isImageOutput(content);
  if (isImage) {
    return {
      totalLines: 1,
      truncatedContent: content,
      isImage
    };
  }
  const maxOutputLength = getMaxOutputLength();
  if (content.length <= maxOutputLength) {
    return {
      totalLines: countCharInString(content, "\n") + 1,
      truncatedContent: content,
      isImage
    };
  }
  const truncatedPart = content.slice(0, maxOutputLength);
  const remainingLines = countCharInString(content, "\n", maxOutputLength) + 1;
  const truncated = `${truncatedPart}

... [${remainingLines} lines truncated] ...`;
  return {
    totalLines: countCharInString(content, "\n") + 1,
    truncatedContent: truncated,
    isImage
  };
}
const stdErrAppendShellResetMessage = (stderr) => `${stderr.trim()}
Shell cwd was reset to ${getOriginalCwd()}`;
function resetCwdIfOutsideProject(toolPermissionContext) {
  const cwd = getCwd();
  const originalCwd = getOriginalCwd();
  const shouldMaintain = shouldMaintainProjectWorkingDir();
  if (shouldMaintain || // Fast path: originalCwd is unconditionally in allWorkingDirectories
  // (filesystem.ts), so when cwd hasn't moved, pathInAllowedWorkingPath is
  // trivially true — skip its syscalls for the no-cd common case.
  cwd !== originalCwd && !pathInAllowedWorkingPath(cwd, toolPermissionContext)) {
    setCwd(originalCwd);
    if (!shouldMaintain) {
      logEvent("tengu_bash_tool_reset_to_original_dir", {});
      return true;
    }
  }
  return false;
}
function createContentSummary(content) {
  const parts = [];
  let textCount = 0;
  let imageCount = 0;
  for (const block of content) {
    if (block.type === "image") {
      imageCount++;
    } else if (block.type === "text" && "text" in block) {
      textCount++;
      const preview = block.text.slice(0, 200);
      parts.push(preview + (block.text.length > 200 ? "..." : ""));
    }
  }
  const summary = [];
  if (imageCount > 0) {
    summary.push(`[${imageCount} ${plural(imageCount, "image")}]`);
  }
  if (textCount > 0) {
    summary.push(`[${textCount} text ${plural(textCount, "block")}]`);
  }
  return `MCP Result: ${summary.join(", ")}${parts.length > 0 ? "\n\n" + parts.join("\n\n") : ""}`;
}
export {
  buildImageToolResult,
  createContentSummary,
  formatOutput,
  isImageOutput,
  parseDataUri,
  resetCwdIfOutsideProject,
  resizeShellImageOutput,
  stdErrAppendShellResetMessage,
  stripEmptyLines
};
