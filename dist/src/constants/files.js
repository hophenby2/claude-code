const BINARY_EXTENSIONS = /* @__PURE__ */ new Set([
  // Images
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".ico",
  ".webp",
  ".tiff",
  ".tif",
  // Videos
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".webm",
  ".wmv",
  ".flv",
  ".m4v",
  ".mpeg",
  ".mpg",
  // Audio
  ".mp3",
  ".wav",
  ".ogg",
  ".flac",
  ".aac",
  ".m4a",
  ".wma",
  ".aiff",
  ".opus",
  // Archives
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".7z",
  ".rar",
  ".xz",
  ".z",
  ".tgz",
  ".iso",
  // Executables/binaries
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".o",
  ".a",
  ".obj",
  ".lib",
  ".app",
  ".msi",
  ".deb",
  ".rpm",
  // Documents (PDF is here; FileReadTool excludes it at the call site)
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".odt",
  ".ods",
  ".odp",
  // Fonts
  ".ttf",
  ".otf",
  ".woff",
  ".woff2",
  ".eot",
  // Bytecode / VM artifacts
  ".pyc",
  ".pyo",
  ".class",
  ".jar",
  ".war",
  ".ear",
  ".node",
  ".wasm",
  ".rlib",
  // Database files
  ".sqlite",
  ".sqlite3",
  ".db",
  ".mdb",
  ".idx",
  // Design / 3D
  ".psd",
  ".ai",
  ".eps",
  ".sketch",
  ".fig",
  ".xd",
  ".blend",
  ".3ds",
  ".max",
  // Flash
  ".swf",
  ".fla",
  // Lock/profiling data
  ".lockb",
  ".dat",
  ".data"
]);
function hasBinaryExtension(filePath) {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}
const BINARY_CHECK_SIZE = 8192;
function isBinaryContent(buffer) {
  const checkSize = Math.min(buffer.length, BINARY_CHECK_SIZE);
  let nonPrintable = 0;
  for (let i = 0; i < checkSize; i++) {
    const byte = buffer[i];
    if (byte === 0) {
      return true;
    }
    if (byte < 32 && byte !== 9 && // tab
    byte !== 10 && // newline
    byte !== 13) {
      nonPrintable++;
    }
  }
  return nonPrintable / checkSize > 0.1;
}
export {
  BINARY_EXTENSIONS,
  hasBinaryExtension,
  isBinaryContent
};
