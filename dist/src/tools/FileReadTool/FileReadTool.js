import { readdir, readFile as readFileAsync } from "fs/promises";
import * as path from "path";
import { posix, win32 } from "path";
import { z } from "zod/v4";
import {
  PDF_AT_MENTION_INLINE_THRESHOLD,
  PDF_EXTRACT_SIZE_THRESHOLD,
  PDF_MAX_PAGES_PER_READ
} from "../../constants/apiLimits.js";
import { hasBinaryExtension } from "../../constants/files.js";
import { memoryFreshnessNote } from "../../memdir/memoryAge.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../../services/analytics/growthbook.js";
import { logEvent } from "../../services/analytics/index.js";
import {
  getFileExtensionForAnalytics
} from "../../services/analytics/metadata.js";
import {
  countTokensWithAPI,
  roughTokenCountEstimationForFileType
} from "../../services/tokenEstimation.js";
import {
  activateConditionalSkillsForPaths,
  addSkillDirectories,
  discoverSkillDirsForPaths
} from "../../skills/loadSkillsDir.js";
import { buildTool } from "../../Tool.js";
import { getCwd } from "../../utils/cwd.js";
import { getClaudeConfigHomeDir, isEnvTruthy } from "../../utils/envUtils.js";
import { getErrnoCode, isENOENT } from "../../utils/errors.js";
import {
  addLineNumbers,
  FILE_NOT_FOUND_CWD_NOTE,
  findSimilarFile,
  getFileModificationTimeAsync,
  suggestPathUnderCwd
} from "../../utils/file.js";
import { logFileOperation } from "../../utils/fileOperationAnalytics.js";
import { formatFileSize } from "../../utils/format.js";
import { getFsImplementation } from "../../utils/fsOperations.js";
import {
  compressImageBufferWithTokenLimit,
  createImageMetadataText,
  detectImageFormatFromBuffer,
  ImageResizeError,
  maybeResizeAndDownsampleImageBuffer
} from "../../utils/imageResizer.js";
import { lazySchema } from "../../utils/lazySchema.js";
import { logError } from "../../utils/log.js";
import { isAutoMemFile } from "../../utils/memoryFileDetection.js";
import { createUserMessage } from "../../utils/messages.js";
import { getCanonicalName, getMainLoopModel } from "../../utils/model/model.js";
import {
  mapNotebookCellsToToolResult,
  readNotebook
} from "../../utils/notebook.js";
import { expandPath } from "../../utils/path.js";
import { extractPDFPages, getPDFPageCount, readPDF } from "../../utils/pdf.js";
import {
  isPDFExtension,
  isPDFSupported,
  parsePDFPageRange
} from "../../utils/pdfUtils.js";
import {
  checkReadPermissionForTool,
  matchingRuleForInput
} from "../../utils/permissions/filesystem.js";
import { matchWildcardPattern } from "../../utils/permissions/shellRuleMatching.js";
import { readFileInRange } from "../../utils/readFileInRange.js";
import { semanticNumber } from "../../utils/semanticNumber.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import { BASH_TOOL_NAME } from "../BashTool/toolName.js";
import { getDefaultFileReadingLimits } from "./limits.js";
import {
  DESCRIPTION,
  FILE_READ_TOOL_NAME,
  FILE_UNCHANGED_STUB,
  LINE_FORMAT_INSTRUCTION,
  OFFSET_INSTRUCTION_DEFAULT,
  OFFSET_INSTRUCTION_TARGETED,
  renderPromptTemplate
} from "./prompt.js";
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  renderToolUseTag,
  userFacingName
} from "./UI.js";
const BLOCKED_DEVICE_PATHS = /* @__PURE__ */ new Set([
  // Infinite output — never reach EOF
  "/dev/zero",
  "/dev/random",
  "/dev/urandom",
  "/dev/full",
  // Blocks waiting for input
  "/dev/stdin",
  "/dev/tty",
  "/dev/console",
  // Nonsensical to read
  "/dev/stdout",
  "/dev/stderr",
  // fd aliases for stdin/stdout/stderr
  "/dev/fd/0",
  "/dev/fd/1",
  "/dev/fd/2"
]);
function isBlockedDevicePath(filePath) {
  if (BLOCKED_DEVICE_PATHS.has(filePath)) return true;
  if (filePath.startsWith("/proc/") && (filePath.endsWith("/fd/0") || filePath.endsWith("/fd/1") || filePath.endsWith("/fd/2")))
    return true;
  return false;
}
const THIN_SPACE = String.fromCharCode(8239);
function getAlternateScreenshotPath(filePath) {
  const filename = path.basename(filePath);
  const amPmPattern = /^(.+)([ \u202F])(AM|PM)(\.png)$/;
  const match = filename.match(amPmPattern);
  if (!match) return void 0;
  const currentSpace = match[2];
  const alternateSpace = currentSpace === " " ? THIN_SPACE : " ";
  return filePath.replace(
    `${currentSpace}${match[3]}${match[4]}`,
    `${alternateSpace}${match[3]}${match[4]}`
  );
}
const fileReadListeners = [];
function registerFileReadListener(listener) {
  fileReadListeners.push(listener);
  return () => {
    const i = fileReadListeners.indexOf(listener);
    if (i >= 0) fileReadListeners.splice(i, 1);
  };
}
class MaxFileReadTokenExceededError extends Error {
  constructor(tokenCount, maxTokens) {
    super(
      `File content (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}). Use offset and limit parameters to read specific portions of the file, or search for specific content instead of reading the whole file.`
    );
    this.tokenCount = tokenCount;
    this.maxTokens = maxTokens;
    this.name = "MaxFileReadTokenExceededError";
  }
  tokenCount;
  maxTokens;
}
const IMAGE_EXTENSIONS = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "gif", "webp"]);
function detectSessionFileType(filePath) {
  const configDir = getClaudeConfigHomeDir();
  if (!filePath.startsWith(configDir)) {
    return null;
  }
  const normalizedPath = filePath.split(win32.sep).join(posix.sep);
  if (normalizedPath.includes("/session-memory/") && normalizedPath.endsWith(".md")) {
    return "session_memory";
  }
  if (normalizedPath.includes("/projects/") && normalizedPath.endsWith(".jsonl")) {
    return "session_transcript";
  }
  return null;
}
const inputSchema = lazySchema(
  () => z.strictObject({
    file_path: z.string().describe("The absolute path to the file to read"),
    offset: semanticNumber(z.number().int().nonnegative().optional()).describe(
      "The line number to start reading from. Only provide if the file is too large to read at once"
    ),
    limit: semanticNumber(z.number().int().positive().optional()).describe(
      "The number of lines to read. Only provide if the file is too large to read at once."
    ),
    pages: z.string().optional().describe(
      `Page range for PDF files (e.g., "1-5", "3", "10-20"). Only applicable to PDF files. Maximum ${PDF_MAX_PAGES_PER_READ} pages per request.`
    )
  })
);
const outputSchema = lazySchema(() => {
  const imageMediaTypes = z.enum([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp"
  ]);
  return z.discriminatedUnion("type", [
    z.object({
      type: z.literal("text"),
      file: z.object({
        filePath: z.string().describe("The path to the file that was read"),
        content: z.string().describe("The content of the file"),
        numLines: z.number().describe("Number of lines in the returned content"),
        startLine: z.number().describe("The starting line number"),
        totalLines: z.number().describe("Total number of lines in the file")
      })
    }),
    z.object({
      type: z.literal("image"),
      file: z.object({
        base64: z.string().describe("Base64-encoded image data"),
        type: imageMediaTypes.describe("The MIME type of the image"),
        originalSize: z.number().describe("Original file size in bytes"),
        dimensions: z.object({
          originalWidth: z.number().optional().describe("Original image width in pixels"),
          originalHeight: z.number().optional().describe("Original image height in pixels"),
          displayWidth: z.number().optional().describe("Displayed image width in pixels (after resizing)"),
          displayHeight: z.number().optional().describe("Displayed image height in pixels (after resizing)")
        }).optional().describe("Image dimension info for coordinate mapping")
      })
    }),
    z.object({
      type: z.literal("notebook"),
      file: z.object({
        filePath: z.string().describe("The path to the notebook file"),
        cells: z.array(z.any()).describe("Array of notebook cells")
      })
    }),
    z.object({
      type: z.literal("pdf"),
      file: z.object({
        filePath: z.string().describe("The path to the PDF file"),
        base64: z.string().describe("Base64-encoded PDF data"),
        originalSize: z.number().describe("Original file size in bytes")
      })
    }),
    z.object({
      type: z.literal("parts"),
      file: z.object({
        filePath: z.string().describe("The path to the PDF file"),
        originalSize: z.number().describe("Original file size in bytes"),
        count: z.number().describe("Number of pages extracted"),
        outputDir: z.string().describe("Directory containing extracted page images")
      })
    }),
    z.object({
      type: z.literal("file_unchanged"),
      file: z.object({
        filePath: z.string().describe("The path to the file")
      })
    })
  ]);
});
const FileReadTool = buildTool({
  name: FILE_READ_TOOL_NAME,
  searchHint: "read files, images, PDFs, notebooks",
  // Output is bounded by maxTokens (validateContentTokens). Persisting to a
  // file the model reads back with Read is circular — never persist.
  maxResultSizeChars: Infinity,
  strict: true,
  async description() {
    return DESCRIPTION;
  },
  async prompt() {
    const limits = getDefaultFileReadingLimits();
    const maxSizeInstruction = limits.includeMaxSizeInPrompt ? `. Files larger than ${formatFileSize(limits.maxSizeBytes)} will return an error; use offset and limit for larger files` : "";
    const offsetInstruction = limits.targetedRangeNudge ? OFFSET_INSTRUCTION_TARGETED : OFFSET_INSTRUCTION_DEFAULT;
    return renderPromptTemplate(
      pickLineFormatInstruction(),
      maxSizeInstruction,
      offsetInstruction
    );
  },
  get inputSchema() {
    return inputSchema();
  },
  get outputSchema() {
    return outputSchema();
  },
  userFacingName,
  getToolUseSummary,
  getActivityDescription(input) {
    const summary = getToolUseSummary(input);
    return summary ? `Reading ${summary}` : "Reading file";
  },
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  toAutoClassifierInput(input) {
    return input.file_path;
  },
  isSearchOrReadCommand() {
    return { isSearch: false, isRead: true };
  },
  getPath({ file_path }) {
    return file_path || getCwd();
  },
  backfillObservableInput(input) {
    if (typeof input.file_path === "string") {
      input.file_path = expandPath(input.file_path);
    }
  },
  async preparePermissionMatcher({ file_path }) {
    return (pattern) => matchWildcardPattern(pattern, file_path);
  },
  async checkPermissions(input, context) {
    const appState = context.getAppState();
    return checkReadPermissionForTool(
      FileReadTool,
      input,
      appState.toolPermissionContext
    );
  },
  renderToolUseMessage,
  renderToolUseTag,
  renderToolResultMessage,
  // UI.tsx:140 — ALL types render summary chrome only: "Read N lines",
  // "Read image (42KB)". Never the content itself. The model-facing
  // serialization (below) sends content + CYBER_RISK_MITIGATION_REMINDER
  // + line prefixes; UI shows none of it. Nothing to index. Caught by
  // the render-fidelity test when this initially claimed file.content.
  extractSearchText() {
    return "";
  },
  renderToolUseErrorMessage,
  async validateInput({ file_path, pages }, toolUseContext) {
    if (pages !== void 0) {
      const parsed = parsePDFPageRange(pages);
      if (!parsed) {
        return {
          result: false,
          message: `Invalid pages parameter: "${pages}". Use formats like "1-5", "3", or "10-20". Pages are 1-indexed.`,
          errorCode: 7
        };
      }
      const rangeSize = parsed.lastPage === Infinity ? PDF_MAX_PAGES_PER_READ + 1 : parsed.lastPage - parsed.firstPage + 1;
      if (rangeSize > PDF_MAX_PAGES_PER_READ) {
        return {
          result: false,
          message: `Page range "${pages}" exceeds maximum of ${PDF_MAX_PAGES_PER_READ} pages per request. Please use a smaller range.`,
          errorCode: 8
        };
      }
    }
    const fullFilePath = expandPath(file_path);
    const appState = toolUseContext.getAppState();
    const denyRule = matchingRuleForInput(
      fullFilePath,
      appState.toolPermissionContext,
      "read",
      "deny"
    );
    if (denyRule !== null) {
      return {
        result: false,
        message: "File is in a directory that is denied by your permission settings.",
        errorCode: 1
      };
    }
    const isUncPath = fullFilePath.startsWith("\\\\") || fullFilePath.startsWith("//");
    if (isUncPath) {
      return { result: true };
    }
    const ext = path.extname(fullFilePath).toLowerCase();
    if (hasBinaryExtension(fullFilePath) && !isPDFExtension(ext) && !IMAGE_EXTENSIONS.has(ext.slice(1))) {
      return {
        result: false,
        message: `This tool cannot read binary files. The file appears to be a binary ${ext} file. Please use appropriate tools for binary file analysis.`,
        errorCode: 4
      };
    }
    if (isBlockedDevicePath(fullFilePath)) {
      return {
        result: false,
        message: `Cannot read '${file_path}': this device file would block or produce infinite output.`,
        errorCode: 9
      };
    }
    return { result: true };
  },
  async call({ file_path, offset = 1, limit = void 0, pages }, context, _canUseTool, parentMessage) {
    const { readFileState, fileReadingLimits } = context;
    const defaults = getDefaultFileReadingLimits();
    const maxSizeBytes = fileReadingLimits?.maxSizeBytes ?? defaults.maxSizeBytes;
    const maxTokens = fileReadingLimits?.maxTokens ?? defaults.maxTokens;
    if (fileReadingLimits !== void 0) {
      logEvent("tengu_file_read_limits_override", {
        hasMaxTokens: fileReadingLimits.maxTokens !== void 0,
        hasMaxSizeBytes: fileReadingLimits.maxSizeBytes !== void 0
      });
    }
    const ext = path.extname(file_path).toLowerCase().slice(1);
    const fullFilePath = expandPath(file_path);
    const dedupKillswitch = getFeatureValue_CACHED_MAY_BE_STALE(
      "tengu_read_dedup_killswitch",
      false
    );
    const existingState = dedupKillswitch ? void 0 : readFileState.get(fullFilePath);
    if (existingState && !existingState.isPartialView && existingState.offset !== void 0) {
      const rangeMatch = existingState.offset === offset && existingState.limit === limit;
      if (rangeMatch) {
        try {
          const mtimeMs = await getFileModificationTimeAsync(fullFilePath);
          if (mtimeMs === existingState.timestamp) {
            const analyticsExt = getFileExtensionForAnalytics(fullFilePath);
            logEvent("tengu_file_read_dedup", {
              ...analyticsExt !== void 0 && { ext: analyticsExt }
            });
            return {
              data: {
                type: "file_unchanged",
                file: { filePath: file_path }
              }
            };
          }
        } catch {
        }
      }
    }
    const cwd = getCwd();
    if (!isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)) {
      const newSkillDirs = await discoverSkillDirsForPaths([fullFilePath], cwd);
      if (newSkillDirs.length > 0) {
        for (const dir of newSkillDirs) {
          context.dynamicSkillDirTriggers?.add(dir);
        }
        addSkillDirectories(newSkillDirs).catch(() => {
        });
      }
      activateConditionalSkillsForPaths([fullFilePath], cwd);
    }
    try {
      return await callInner(
        file_path,
        fullFilePath,
        fullFilePath,
        ext,
        offset,
        limit,
        pages,
        maxSizeBytes,
        maxTokens,
        readFileState,
        context,
        parentMessage?.message.id
      );
    } catch (error) {
      const code = getErrnoCode(error);
      if (code === "ENOENT") {
        const altPath = getAlternateScreenshotPath(fullFilePath);
        if (altPath) {
          try {
            return await callInner(
              file_path,
              fullFilePath,
              altPath,
              ext,
              offset,
              limit,
              pages,
              maxSizeBytes,
              maxTokens,
              readFileState,
              context,
              parentMessage?.message.id
            );
          } catch (altError) {
            if (!isENOENT(altError)) {
              throw altError;
            }
          }
        }
        const similarFilename = findSimilarFile(fullFilePath);
        const cwdSuggestion = await suggestPathUnderCwd(fullFilePath);
        let message = `File does not exist. ${FILE_NOT_FOUND_CWD_NOTE} ${getCwd()}.`;
        if (cwdSuggestion) {
          message += ` Did you mean ${cwdSuggestion}?`;
        } else if (similarFilename) {
          message += ` Did you mean ${similarFilename}?`;
        }
        throw new Error(message);
      }
      throw error;
    }
  },
  mapToolResultToToolResultBlockParam(data, toolUseID) {
    switch (data.type) {
      case "image": {
        return {
          tool_use_id: toolUseID,
          type: "tool_result",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                data: data.file.base64,
                media_type: data.file.type
              }
            }
          ]
        };
      }
      case "notebook":
        return mapNotebookCellsToToolResult(data.file.cells, toolUseID);
      case "pdf":
        return {
          tool_use_id: toolUseID,
          type: "tool_result",
          content: `PDF file read: ${data.file.filePath} (${formatFileSize(data.file.originalSize)})`
        };
      case "parts":
        return {
          tool_use_id: toolUseID,
          type: "tool_result",
          content: `PDF pages extracted: ${data.file.count} page(s) from ${data.file.filePath} (${formatFileSize(data.file.originalSize)})`
        };
      case "file_unchanged":
        return {
          tool_use_id: toolUseID,
          type: "tool_result",
          content: FILE_UNCHANGED_STUB
        };
      case "text": {
        let content;
        if (data.file.content) {
          content = memoryFileFreshnessPrefix(data) + formatFileLines(data.file) + (shouldIncludeFileReadMitigation() ? CYBER_RISK_MITIGATION_REMINDER : "");
        } else {
          content = data.file.totalLines === 0 ? "<system-reminder>Warning: the file exists but the contents are empty.</system-reminder>" : `<system-reminder>Warning: the file exists but is shorter than the provided offset (${data.file.startLine}). The file has ${data.file.totalLines} lines.</system-reminder>`;
        }
        return {
          tool_use_id: toolUseID,
          type: "tool_result",
          content
        };
      }
    }
  }
});
function pickLineFormatInstruction() {
  return LINE_FORMAT_INSTRUCTION;
}
function formatFileLines(file) {
  return addLineNumbers(file);
}
const CYBER_RISK_MITIGATION_REMINDER = "\n\n<system-reminder>\nWhenever you read a file, you should consider whether it would be considered malware. You CAN and SHOULD provide analysis of malware, what it is doing. But you MUST refuse to improve or augment the code. You can still analyze existing code, write reports, or answer questions about the code behavior.\n</system-reminder>\n";
const MITIGATION_EXEMPT_MODELS = /* @__PURE__ */ new Set(["claude-opus-4-6"]);
function shouldIncludeFileReadMitigation() {
  const shortName = getCanonicalName(getMainLoopModel());
  return !MITIGATION_EXEMPT_MODELS.has(shortName);
}
const memoryFileMtimes = /* @__PURE__ */ new WeakMap();
function memoryFileFreshnessPrefix(data) {
  const mtimeMs = memoryFileMtimes.get(data);
  if (mtimeMs === void 0) return "";
  return memoryFreshnessNote(mtimeMs);
}
async function validateContentTokens(content, ext, maxTokens) {
  const effectiveMaxTokens = maxTokens ?? getDefaultFileReadingLimits().maxTokens;
  const tokenEstimate = roughTokenCountEstimationForFileType(content, ext);
  if (!tokenEstimate || tokenEstimate <= effectiveMaxTokens / 4) return;
  const tokenCount = await countTokensWithAPI(content);
  const effectiveCount = tokenCount ?? tokenEstimate;
  if (effectiveCount > effectiveMaxTokens) {
    throw new MaxFileReadTokenExceededError(effectiveCount, effectiveMaxTokens);
  }
}
function createImageResponse(buffer, mediaType, originalSize, dimensions) {
  return {
    type: "image",
    file: {
      base64: buffer.toString("base64"),
      type: `image/${mediaType}`,
      originalSize,
      dimensions
    }
  };
}
async function callInner(file_path, fullFilePath, resolvedFilePath, ext, offset, limit, pages, maxSizeBytes, maxTokens, readFileState, context, messageId) {
  if (ext === "ipynb") {
    const cells = await readNotebook(resolvedFilePath);
    const cellsJson = jsonStringify(cells);
    const cellsJsonBytes = Buffer.byteLength(cellsJson);
    if (cellsJsonBytes > maxSizeBytes) {
      throw new Error(
        `Notebook content (${formatFileSize(cellsJsonBytes)}) exceeds maximum allowed size (${formatFileSize(maxSizeBytes)}). Use ${BASH_TOOL_NAME} with jq to read specific portions:
  cat "${file_path}" | jq '.cells[:20]' # First 20 cells
  cat "${file_path}" | jq '.cells[100:120]' # Cells 100-120
  cat "${file_path}" | jq '.cells | length' # Count total cells
  cat "${file_path}" | jq '.cells[] | select(.cell_type=="code") | .source' # All code sources`
      );
    }
    await validateContentTokens(cellsJson, ext, maxTokens);
    const stats = await getFsImplementation().stat(resolvedFilePath);
    readFileState.set(fullFilePath, {
      content: cellsJson,
      timestamp: Math.floor(stats.mtimeMs),
      offset,
      limit
    });
    context.nestedMemoryAttachmentTriggers?.add(fullFilePath);
    const data2 = {
      type: "notebook",
      file: { filePath: file_path, cells }
    };
    logFileOperation({
      operation: "read",
      tool: "FileReadTool",
      filePath: fullFilePath,
      content: cellsJson
    });
    return { data: data2 };
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    const data2 = await readImageWithTokenBudget(resolvedFilePath, maxTokens);
    context.nestedMemoryAttachmentTriggers?.add(fullFilePath);
    logFileOperation({
      operation: "read",
      tool: "FileReadTool",
      filePath: fullFilePath,
      content: data2.file.base64
    });
    const metadataText = data2.file.dimensions ? createImageMetadataText(data2.file.dimensions) : null;
    return {
      data: data2,
      ...metadataText && {
        newMessages: [
          createUserMessage({ content: metadataText, isMeta: true })
        ]
      }
    };
  }
  if (isPDFExtension(ext)) {
    if (pages) {
      const parsedRange = parsePDFPageRange(pages);
      const extractResult = await extractPDFPages(
        resolvedFilePath,
        parsedRange ?? void 0
      );
      if (!extractResult.success) {
        throw new Error(extractResult.error.message);
      }
      logEvent("tengu_pdf_page_extraction", {
        success: true,
        pageCount: extractResult.data.file.count,
        fileSize: extractResult.data.file.originalSize,
        hasPageRange: true
      });
      logFileOperation({
        operation: "read",
        tool: "FileReadTool",
        filePath: fullFilePath,
        content: `PDF pages ${pages}`
      });
      const entries = await readdir(extractResult.data.file.outputDir);
      const imageFiles = entries.filter((f) => f.endsWith(".jpg")).sort();
      const imageBlocks = await Promise.all(
        imageFiles.map(async (f) => {
          const imgPath = path.join(extractResult.data.file.outputDir, f);
          const imgBuffer = await readFileAsync(imgPath);
          const resized = await maybeResizeAndDownsampleImageBuffer(
            imgBuffer,
            imgBuffer.length,
            "jpeg"
          );
          return {
            type: "image",
            source: {
              type: "base64",
              media_type: `image/${resized.mediaType}`,
              data: resized.buffer.toString("base64")
            }
          };
        })
      );
      return {
        data: extractResult.data,
        ...imageBlocks.length > 0 && {
          newMessages: [
            createUserMessage({ content: imageBlocks, isMeta: true })
          ]
        }
      };
    }
    const pageCount = await getPDFPageCount(resolvedFilePath);
    if (pageCount !== null && pageCount > PDF_AT_MENTION_INLINE_THRESHOLD) {
      throw new Error(
        `This PDF has ${pageCount} pages, which is too many to read at once. Use the pages parameter to read specific page ranges (e.g., pages: "1-5"). Maximum ${PDF_MAX_PAGES_PER_READ} pages per request.`
      );
    }
    const fs = getFsImplementation();
    const stats = await fs.stat(resolvedFilePath);
    const shouldExtractPages = !isPDFSupported() || stats.size > PDF_EXTRACT_SIZE_THRESHOLD;
    if (shouldExtractPages) {
      const extractResult = await extractPDFPages(resolvedFilePath);
      if (extractResult.success) {
        logEvent("tengu_pdf_page_extraction", {
          success: true,
          pageCount: extractResult.data.file.count,
          fileSize: extractResult.data.file.originalSize
        });
      } else {
        logEvent("tengu_pdf_page_extraction", {
          success: false,
          available: extractResult.error.reason !== "unavailable",
          fileSize: stats.size
        });
      }
    }
    if (!isPDFSupported()) {
      throw new Error(
        `Reading full PDFs is not supported with this model. Use a newer model (Sonnet 3.5 v2 or later), or use the pages parameter to read specific page ranges (e.g., pages: "1-5", maximum ${PDF_MAX_PAGES_PER_READ} pages per request). Page extraction requires poppler-utils: install with \`brew install poppler\` on macOS or \`apt-get install poppler-utils\` on Debian/Ubuntu.`
      );
    }
    const readResult = await readPDF(resolvedFilePath);
    if (!readResult.success) {
      throw new Error(readResult.error.message);
    }
    const pdfData = readResult.data;
    logFileOperation({
      operation: "read",
      tool: "FileReadTool",
      filePath: fullFilePath,
      content: pdfData.file.base64
    });
    return {
      data: pdfData,
      newMessages: [
        createUserMessage({
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfData.file.base64
              }
            }
          ],
          isMeta: true
        })
      ]
    };
  }
  const lineOffset = offset === 0 ? 0 : offset - 1;
  const { content, lineCount, totalLines, totalBytes, readBytes, mtimeMs } = await readFileInRange(
    resolvedFilePath,
    lineOffset,
    limit,
    limit === void 0 ? maxSizeBytes : void 0,
    context.abortController.signal
  );
  await validateContentTokens(content, ext, maxTokens);
  readFileState.set(fullFilePath, {
    content,
    timestamp: Math.floor(mtimeMs),
    offset,
    limit
  });
  context.nestedMemoryAttachmentTriggers?.add(fullFilePath);
  for (const listener of fileReadListeners.slice()) {
    listener(resolvedFilePath, content);
  }
  const data = {
    type: "text",
    file: {
      filePath: file_path,
      content,
      numLines: lineCount,
      startLine: offset,
      totalLines
    }
  };
  if (isAutoMemFile(fullFilePath)) {
    memoryFileMtimes.set(data, mtimeMs);
  }
  logFileOperation({
    operation: "read",
    tool: "FileReadTool",
    filePath: fullFilePath,
    content
  });
  const sessionFileType = detectSessionFileType(fullFilePath);
  const analyticsExt = getFileExtensionForAnalytics(fullFilePath);
  logEvent("tengu_session_file_read", {
    totalLines,
    readLines: lineCount,
    totalBytes,
    readBytes,
    offset,
    ...limit !== void 0 && { limit },
    ...analyticsExt !== void 0 && { ext: analyticsExt },
    ...messageId !== void 0 && {
      messageID: messageId
    },
    is_session_memory: sessionFileType === "session_memory",
    is_session_transcript: sessionFileType === "session_transcript"
  });
  return { data };
}
async function readImageWithTokenBudget(filePath, maxTokens = getDefaultFileReadingLimits().maxTokens, maxBytes) {
  const imageBuffer = await getFsImplementation().readFileBytes(
    filePath,
    maxBytes
  );
  const originalSize = imageBuffer.length;
  if (originalSize === 0) {
    throw new Error(`Image file is empty: ${filePath}`);
  }
  const detectedMediaType = detectImageFormatFromBuffer(imageBuffer);
  const detectedFormat = detectedMediaType.split("/")[1] || "png";
  let result;
  try {
    const resized = await maybeResizeAndDownsampleImageBuffer(
      imageBuffer,
      originalSize,
      detectedFormat
    );
    result = createImageResponse(
      resized.buffer,
      resized.mediaType,
      originalSize,
      resized.dimensions
    );
  } catch (e) {
    if (e instanceof ImageResizeError) throw e;
    logError(e);
    result = createImageResponse(imageBuffer, detectedFormat, originalSize);
  }
  const estimatedTokens = Math.ceil(result.file.base64.length * 0.125);
  if (estimatedTokens > maxTokens) {
    try {
      const compressed = await compressImageBufferWithTokenLimit(
        imageBuffer,
        maxTokens,
        detectedMediaType
      );
      return {
        type: "image",
        file: {
          base64: compressed.base64,
          type: compressed.mediaType,
          originalSize
        }
      };
    } catch (e) {
      logError(e);
      try {
        const sharpModule = await import("sharp");
        const sharp = sharpModule.default || sharpModule;
        const fallbackBuffer = await sharp(imageBuffer).resize(400, 400, {
          fit: "inside",
          withoutEnlargement: true
        }).jpeg({ quality: 20 }).toBuffer();
        return createImageResponse(fallbackBuffer, "jpeg", originalSize);
      } catch (error) {
        logError(error);
        return createImageResponse(imageBuffer, detectedFormat, originalSize);
      }
    }
  }
  return result;
}
export {
  CYBER_RISK_MITIGATION_REMINDER,
  FileReadTool,
  MaxFileReadTokenExceededError,
  readImageWithTokenBudget,
  registerFileReadListener
};
