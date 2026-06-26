import { mkdir, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { ansiToPng } from "./ansiToPng.js";
import { execFileNoThrowWithCwd } from "./execFileNoThrow.js";
import { logError } from "./log.js";
import { getPlatform } from "./platform.js";
async function copyAnsiToClipboard(ansiText, options) {
  try {
    const tempDir = join(tmpdir(), "claude-code-screenshots");
    await mkdir(tempDir, { recursive: true });
    const pngPath = join(tempDir, `screenshot-${Date.now()}.png`);
    const pngBuffer = ansiToPng(ansiText, options);
    await writeFile(pngPath, pngBuffer);
    const result = await copyPngToClipboard(pngPath);
    try {
      await unlink(pngPath);
    } catch {
    }
    return result;
  } catch (error) {
    logError(error);
    return {
      success: false,
      message: `Failed to copy screenshot: ${error instanceof Error ? error.message : "Unknown error"}`
    };
  }
}
async function copyPngToClipboard(pngPath) {
  const platform = getPlatform();
  if (platform === "macos") {
    const escapedPath = pngPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const script = `set the clipboard to (read (POSIX file "${escapedPath}") as \xABclass PNGf\xBB)`;
    const result = await execFileNoThrowWithCwd("osascript", ["-e", script], {
      timeout: 5e3
    });
    if (result.code === 0) {
      return { success: true, message: "Screenshot copied to clipboard" };
    }
    return {
      success: false,
      message: `Failed to copy to clipboard: ${result.stderr}`
    };
  }
  if (platform === "linux") {
    const xclipResult = await execFileNoThrowWithCwd(
      "xclip",
      ["-selection", "clipboard", "-t", "image/png", "-i", pngPath],
      { timeout: 5e3 }
    );
    if (xclipResult.code === 0) {
      return { success: true, message: "Screenshot copied to clipboard" };
    }
    const xselResult = await execFileNoThrowWithCwd(
      "xsel",
      ["--clipboard", "--input", "--type", "image/png"],
      { timeout: 5e3 }
    );
    if (xselResult.code === 0) {
      return { success: true, message: "Screenshot copied to clipboard" };
    }
    return {
      success: false,
      message: "Failed to copy to clipboard. Please install xclip or xsel: sudo apt install xclip"
    };
  }
  if (platform === "windows") {
    const psScript = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetImage([System.Drawing.Image]::FromFile('${pngPath.replace(/'/g, "''")}'))`;
    const result = await execFileNoThrowWithCwd(
      "powershell",
      ["-NoProfile", "-Command", psScript],
      { timeout: 5e3 }
    );
    if (result.code === 0) {
      return { success: true, message: "Screenshot copied to clipboard" };
    }
    return {
      success: false,
      message: `Failed to copy to clipboard: ${result.stderr}`
    };
  }
  return {
    success: false,
    message: `Screenshot to clipboard is not supported on ${platform}`
  };
}
export {
  copyAnsiToClipboard
};
