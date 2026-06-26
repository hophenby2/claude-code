const feature = (_name) => false;
import { randomBytes } from "crypto";
import { execa } from "execa";
import { basename, extname, isAbsolute, join } from "path";
import "../constants/apiLimits.js";
import "../services/analytics/growthbook.js";
import { getImageProcessor } from "../tools/FileReadTool/imageProcessor.js";
import { logForDebugging } from "./debug.js";
import { execFileNoThrowWithCwd } from "./execFileNoThrow.js";
import { getFsImplementation } from "./fsOperations.js";
import {
  detectImageFormatFromBase64,
  maybeResizeAndDownsampleImageBuffer
} from "./imageResizer.js";
import { logError } from "./log.js";
const PASTE_THRESHOLD = 800;
function getClipboardCommands() {
  const platform = process.platform;
  const baseTmpDir = process.env.CLAUDE_CODE_TMPDIR || (platform === "win32" ? process.env.TEMP || "C:\\Temp" : "/tmp");
  const screenshotFilename = "claude_cli_latest_screenshot.png";
  const tempPaths = {
    darwin: join(baseTmpDir, screenshotFilename),
    linux: join(baseTmpDir, screenshotFilename),
    win32: join(baseTmpDir, screenshotFilename)
  };
  const screenshotPath = tempPaths[platform] || tempPaths.linux;
  const commands = {
    darwin: {
      checkImage: `osascript -e 'the clipboard as \xABclass PNGf\xBB'`,
      saveImage: `osascript -e 'set png_data to (the clipboard as \xABclass PNGf\xBB)' -e 'set fp to open for access POSIX file "${screenshotPath}" with write permission' -e 'write png_data to fp' -e 'close access fp'`,
      getPath: `osascript -e 'get POSIX path of (the clipboard as \xABclass furl\xBB)'`,
      deleteFile: `rm -f "${screenshotPath}"`
    },
    linux: {
      checkImage: 'xclip -selection clipboard -t TARGETS -o 2>/dev/null | grep -E "image/(png|jpeg|jpg|gif|webp|bmp)" || wl-paste -l 2>/dev/null | grep -E "image/(png|jpeg|jpg|gif|webp|bmp)"',
      saveImage: `xclip -selection clipboard -t image/png -o > "${screenshotPath}" 2>/dev/null || wl-paste --type image/png > "${screenshotPath}" 2>/dev/null || xclip -selection clipboard -t image/bmp -o > "${screenshotPath}" 2>/dev/null || wl-paste --type image/bmp > "${screenshotPath}"`,
      getPath: "xclip -selection clipboard -t text/plain -o 2>/dev/null || wl-paste 2>/dev/null",
      deleteFile: `rm -f "${screenshotPath}"`
    },
    win32: {
      checkImage: 'powershell -NoProfile -Command "(Get-Clipboard -Format Image) -ne $null"',
      saveImage: `powershell -NoProfile -Command "$img = Get-Clipboard -Format Image; if ($img) { $img.Save('${screenshotPath.replace(/\\/g, "\\\\")}', [System.Drawing.Imaging.ImageFormat]::Png) }"`,
      getPath: 'powershell -NoProfile -Command "Get-Clipboard"',
      deleteFile: `del /f "${screenshotPath}"`
    }
  };
  return {
    commands: commands[platform] || commands.linux,
    screenshotPath
  };
}
async function hasImageInClipboard() {
  if (process.platform !== "darwin") {
    return false;
  }
  if (false) {
    try {
      const { getNativeModule } = await null;
      const hasImage = getNativeModule()?.hasClipboardImage;
      if (hasImage) {
        return hasImage();
      }
    } catch (e) {
      logError(e);
    }
  }
  const result = await execFileNoThrowWithCwd("osascript", [
    "-e",
    "the clipboard as \xABclass PNGf\xBB"
  ]);
  return result.code === 0;
}
async function getImageFromClipboard() {
  if (false) {
    try {
      const { getNativeModule } = await null;
      const readClipboard = getNativeModule()?.readClipboardImage;
      if (!readClipboard) {
        throw new Error("native clipboard reader unavailable");
      }
      const native = readClipboard(IMAGE_MAX_WIDTH, IMAGE_MAX_HEIGHT);
      if (!native) {
        return null;
      }
      const buffer = native.png;
      if (buffer.length > IMAGE_TARGET_RAW_SIZE) {
        const resized = await maybeResizeAndDownsampleImageBuffer(
          buffer,
          buffer.length,
          "png"
        );
        return {
          base64: resized.buffer.toString("base64"),
          mediaType: `image/${resized.mediaType}`,
          // resized.dimensions sees the already-downsampled buffer; native knows the true originals.
          dimensions: {
            originalWidth: native.originalWidth,
            originalHeight: native.originalHeight,
            displayWidth: resized.dimensions?.displayWidth ?? native.width,
            displayHeight: resized.dimensions?.displayHeight ?? native.height
          }
        };
      }
      return {
        base64: buffer.toString("base64"),
        mediaType: "image/png",
        dimensions: {
          originalWidth: native.originalWidth,
          originalHeight: native.originalHeight,
          displayWidth: native.width,
          displayHeight: native.height
        }
      };
    } catch (e) {
      logError(e);
    }
  }
  const { commands, screenshotPath } = getClipboardCommands();
  try {
    const checkResult = await execa(commands.checkImage, {
      shell: true,
      reject: false
    });
    if (checkResult.exitCode !== 0) {
      return null;
    }
    const saveResult = await execa(commands.saveImage, {
      shell: true,
      reject: false
    });
    if (saveResult.exitCode !== 0) {
      return null;
    }
    let imageBuffer = getFsImplementation().readFileBytesSync(screenshotPath);
    if (imageBuffer.length >= 2 && imageBuffer[0] === 66 && imageBuffer[1] === 77) {
      const sharp = await getImageProcessor();
      imageBuffer = await sharp(imageBuffer).png().toBuffer();
    }
    const resized = await maybeResizeAndDownsampleImageBuffer(
      imageBuffer,
      imageBuffer.length,
      "png"
    );
    const base64Image = resized.buffer.toString("base64");
    const mediaType = detectImageFormatFromBase64(base64Image);
    void execa(commands.deleteFile, { shell: true, reject: false });
    return {
      base64: base64Image,
      mediaType,
      dimensions: resized.dimensions
    };
  } catch {
    return null;
  }
}
async function getImagePathFromClipboard() {
  const { commands } = getClipboardCommands();
  try {
    const result = await execa(commands.getPath, {
      shell: true,
      reject: false
    });
    if (result.exitCode !== 0 || !result.stdout) {
      return null;
    }
    return result.stdout.trim();
  } catch (e) {
    logError(e);
    return null;
  }
}
const IMAGE_EXTENSION_REGEX = /\.(png|jpe?g|gif|webp)$/i;
function removeOuterQuotes(text) {
  if (text.startsWith('"') && text.endsWith('"') || text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1);
  }
  return text;
}
function stripBackslashEscapes(path) {
  const platform = process.platform;
  if (platform === "win32") {
    return path;
  }
  const salt = randomBytes(8).toString("hex");
  const placeholder = `__DOUBLE_BACKSLASH_${salt}__`;
  const withPlaceholder = path.replace(/\\\\/g, placeholder);
  const withoutEscapes = withPlaceholder.replace(/\\(.)/g, "$1");
  return withoutEscapes.replace(new RegExp(placeholder, "g"), "\\");
}
function isImageFilePath(text) {
  const cleaned = removeOuterQuotes(text.trim());
  const unescaped = stripBackslashEscapes(cleaned);
  return IMAGE_EXTENSION_REGEX.test(unescaped);
}
function asImageFilePath(text) {
  const cleaned = removeOuterQuotes(text.trim());
  const unescaped = stripBackslashEscapes(cleaned);
  if (IMAGE_EXTENSION_REGEX.test(unescaped)) {
    return unescaped;
  }
  return null;
}
async function tryReadImageFromPath(text) {
  const cleanedPath = asImageFilePath(text);
  if (!cleanedPath) {
    return null;
  }
  const imagePath = cleanedPath;
  let imageBuffer;
  try {
    if (isAbsolute(imagePath)) {
      imageBuffer = getFsImplementation().readFileBytesSync(imagePath);
    } else {
      const clipboardPath = await getImagePathFromClipboard();
      if (clipboardPath && imagePath === basename(clipboardPath)) {
        imageBuffer = getFsImplementation().readFileBytesSync(clipboardPath);
      }
    }
  } catch (e) {
    logError(e);
    return null;
  }
  if (!imageBuffer) {
    return null;
  }
  if (imageBuffer.length === 0) {
    logForDebugging(`Image file is empty: ${imagePath}`, { level: "warn" });
    return null;
  }
  if (imageBuffer.length >= 2 && imageBuffer[0] === 66 && imageBuffer[1] === 77) {
    const sharp = await getImageProcessor();
    imageBuffer = await sharp(imageBuffer).png().toBuffer();
  }
  const ext = extname(imagePath).slice(1).toLowerCase() || "png";
  const resized = await maybeResizeAndDownsampleImageBuffer(
    imageBuffer,
    imageBuffer.length,
    ext
  );
  const base64Image = resized.buffer.toString("base64");
  const mediaType = detectImageFormatFromBase64(base64Image);
  return {
    path: imagePath,
    base64: base64Image,
    mediaType,
    dimensions: resized.dimensions
  };
}
export {
  IMAGE_EXTENSION_REGEX,
  PASTE_THRESHOLD,
  asImageFilePath,
  getImageFromClipboard,
  getImagePathFromClipboard,
  hasImageInClipboard,
  isImageFilePath,
  tryReadImageFromPath
};
