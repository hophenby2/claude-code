import { basename, extname, posix, sep } from "path";
const EXCLUDED_FILENAMES = /* @__PURE__ */ new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "bun.lock",
  "composer.lock",
  "gemfile.lock",
  "cargo.lock",
  "poetry.lock",
  "pipfile.lock",
  "shrinkwrap.json",
  "npm-shrinkwrap.json"
]);
const EXCLUDED_EXTENSIONS = /* @__PURE__ */ new Set([
  ".lock",
  ".min.js",
  ".min.css",
  ".min.html",
  ".bundle.js",
  ".bundle.css",
  ".generated.ts",
  ".generated.js",
  ".d.ts"
  // TypeScript declaration files
]);
const EXCLUDED_DIRECTORIES = [
  "/dist/",
  "/build/",
  "/out/",
  "/output/",
  "/node_modules/",
  "/vendor/",
  "/vendored/",
  "/third_party/",
  "/third-party/",
  "/external/",
  "/.next/",
  "/.nuxt/",
  "/.svelte-kit/",
  "/coverage/",
  "/__pycache__/",
  "/.tox/",
  "/venv/",
  "/.venv/",
  "/target/release/",
  "/target/debug/"
];
const EXCLUDED_FILENAME_PATTERNS = [
  /^.*\.min\.[a-z]+$/i,
  // *.min.*
  /^.*-min\.[a-z]+$/i,
  // *-min.*
  /^.*\.bundle\.[a-z]+$/i,
  // *.bundle.*
  /^.*\.generated\.[a-z]+$/i,
  // *.generated.*
  /^.*\.gen\.[a-z]+$/i,
  // *.gen.*
  /^.*\.auto\.[a-z]+$/i,
  // *.auto.*
  /^.*_generated\.[a-z]+$/i,
  // *_generated.*
  /^.*_gen\.[a-z]+$/i,
  // *_gen.*
  /^.*\.pb\.(go|js|ts|py|rb)$/i,
  // Protocol buffer generated files
  /^.*_pb2?\.py$/i,
  // Python protobuf files
  /^.*\.pb\.h$/i,
  // C++ protobuf headers
  /^.*\.grpc\.[a-z]+$/i,
  // gRPC generated files
  /^.*\.swagger\.[a-z]+$/i,
  // Swagger generated files
  /^.*\.openapi\.[a-z]+$/i
  // OpenAPI generated files
];
function isGeneratedFile(filePath) {
  const normalizedPath = posix.sep + filePath.split(sep).join(posix.sep).replace(/^\/+/, "");
  const fileName = basename(filePath).toLowerCase();
  const ext = extname(filePath).toLowerCase();
  if (EXCLUDED_FILENAMES.has(fileName)) {
    return true;
  }
  if (EXCLUDED_EXTENSIONS.has(ext)) {
    return true;
  }
  const parts = fileName.split(".");
  if (parts.length > 2) {
    const compoundExt = "." + parts.slice(-2).join(".");
    if (EXCLUDED_EXTENSIONS.has(compoundExt)) {
      return true;
    }
  }
  for (const dir of EXCLUDED_DIRECTORIES) {
    if (normalizedPath.includes(dir)) {
      return true;
    }
  }
  for (const pattern of EXCLUDED_FILENAME_PATTERNS) {
    if (pattern.test(fileName)) {
      return true;
    }
  }
  return false;
}
function filterGeneratedFiles(files) {
  return files.filter((file) => !isGeneratedFile(file));
}
export {
  filterGeneratedFiles,
  isGeneratedFile
};
