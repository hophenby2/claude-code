import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const srcRoot = path.join(root, 'src')
const outdir = path.join(root, 'dist')

const version = process.env.CLAUDE_CODE_RECONSTRUCTED_VERSION ?? '0.0.0-dev'

const enabledFeatures = new Set([
  // Keep this set deliberately small. Most leaked/internal/native-heavy features
  // should stay disabled for a local smoke build.
])

function featureValue(name) {
  return enabledFeatures.has(name) ? 'true' : 'false'
}

function transformFeatures(source) {
  return source
    .replace(/^\s*import\s+\{\s*feature\s*\}\s+from\s+['"]bun:bundle['"];?\s*$/gm, 'const feature = (_name) => false')
    .replace(/\bfeature\(\s*(['"])([A-Z0-9_]+)\1\s*\)/g, (_match, _quote, name) => featureValue(name))
}

function transformSrcAliases(source, filePath) {
  return source.replace(/(['"])(src\/+[^'"]+)\1/g, (match, quote, specifier) => {
    const target = path.join(srcRoot, specifier.replace(/^src\/+/, ''))
    let relative = path.relative(path.dirname(filePath), target).replaceAll(path.sep, '/')
    if (!relative.startsWith('.')) relative = `./${relative}`
    return `${quote}${relative}${quote}`
  })
}

function transformTypeDeclarationSideEffects(source) {
  return source.replace(/^\s*import\s+(['"][^'"]+\.d\.ts['"]);?\s*$/gm, '')
}

function transformRelativeExtensions(source, filePath) {
  return source.replace(/(['"])(\.\.?\/[^'"]+\.(?:jsx|md|txt|ts|tsx))\1/g, (match, quote, specifier) => {
    if (specifier.endsWith('.md') || specifier.endsWith('.txt')) {
      const target = resolveSourcePath(path.resolve(path.dirname(filePath), specifier))
      if (!target || !target.startsWith(srcRoot)) return match
      const assetTarget = path.join(outdir, path.relative(root, target)) + '.js'
      let relative = path.relative(path.dirname(path.join(outdir, path.relative(root, filePath))).replace(/\.(ts|tsx|jsx)$/, '.js'), assetTarget).replaceAll(path.sep, '/')
      if (!relative.startsWith('.')) relative = `./${relative}`
      return `${quote}${relative}${quote}`
    }
    const target = resolveSourcePath(path.resolve(path.dirname(filePath), specifier))
    if (!target || !target.startsWith(srcRoot)) return match
    const jsTarget = path.join(outdir, path.relative(root, target)).replace(/\.(ts|tsx|jsx)$/, '.js')
    let relative = path.relative(path.dirname(path.join(outdir, path.relative(root, filePath))).replace(/\.(ts|tsx|jsx)$/, '.js'), jsTarget).replaceAll(path.sep, '/')
    if (!relative.startsWith('.')) relative = `./${relative}`
    return `${quote}${relative}${quote}`
  })
}

function transformSource(source, filePath) {
  return transformRelativeExtensions(transformTypeDeclarationSideEffects(transformSrcAliases(transformFeatures(source), filePath)), filePath)
}

function resolveSourcePath(candidate) {
  const normalized = path.normalize(candidate)
  const ext = path.extname(normalized)
  const withoutJs = ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs'
    ? normalized.slice(0, -ext.length)
    : normalized

  const candidates = [
    normalized,
    `${withoutJs}.ts`,
    `${withoutJs}.tsx`,
    `${withoutJs}.js`,
    `${withoutJs}.jsx`,
    path.join(withoutJs, 'index.ts'),
    path.join(withoutJs, 'index.tsx'),
    path.join(withoutJs, 'index.js'),
  ]

  return candidates.find(existsSync)
}

function sourceAssetPlaceholders() {
  const placeholders = [
    'skills/bundled/verify/SKILL.md',
    'skills/bundled/verify/examples/cli.md',
    'skills/bundled/verify/examples/server.md',
  ]

  for (const rel of [
    'SKILL.md',
    'csharp/claude-api.md',
    'curl/examples.md',
    'go/claude-api.md',
    'java/claude-api.md',
    'php/claude-api.md',
    'python/agent-sdk/README.md',
    'python/agent-sdk/patterns.md',
    'python/claude-api/README.md',
    'python/claude-api/batches.md',
    'python/claude-api/files-api.md',
    'python/claude-api/streaming.md',
    'python/claude-api/tool-use.md',
    'ruby/claude-api.md',
    'shared/error-codes.md',
    'shared/live-sources.md',
    'shared/models.md',
    'shared/prompt-caching.md',
    'shared/tool-use-concepts.md',
    'typescript/agent-sdk/README.md',
    'typescript/agent-sdk/patterns.md',
    'typescript/claude-api/README.md',
    'typescript/claude-api/batches.md',
    'typescript/claude-api/files-api.md',
    'typescript/claude-api/streaming.md',
    'typescript/claude-api/tool-use.md',
  ]) {
    placeholders.push(`skills/bundled/claude-api/${rel}`)
  }

  return placeholders
}

async function ensureSourceAssetPlaceholders() {
  for (const rel of sourceAssetPlaceholders()) {
    const target = path.join(srcRoot, rel)
    if (existsSync(target)) continue
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, `# Placeholder ${rel}\n`)
  }
}

async function collectSourceEntrypoints(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const result = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...await collectSourceEntrypoints(fullPath))
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      result.push(fullPath)
    }
  }

  return result
}

async function copySourceAssets(dir) {
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await copySourceAssets(fullPath)
    } else if (/\.(js|txt|md)$/.test(entry.name)) {
      const destination = path.join(outdir, path.relative(root, fullPath))
      await mkdir(path.dirname(destination), { recursive: true })
      await copyFile(fullPath, destination)
      if (entry.name.endsWith('.md') || entry.name.endsWith('.txt')) {
        await writeFile(`${destination}.js`, `export default ${JSON.stringify(await readFile(fullPath, 'utf8'))}\n`)
      }
    }
  }

  if (dir === path.join(srcRoot, 'skills', 'bundled')) {
    const verifyDir = path.join(outdir, 'src/skills/bundled/verify/examples')
    await mkdir(verifyDir, { recursive: true })
    await writeFile(path.join(verifyDir, 'cli.md'), '# Placeholder verify CLI example\n')
    await writeFile(path.join(verifyDir, 'server.md'), '# Placeholder verify server example\n')
    const claudeApiDir = path.join(outdir, 'src/skills/bundled/claude-api')
    for (const rel of [
      'SKILL.md',
      'csharp/claude-api.md',
      'curl/examples.md',
      'go/claude-api.md',
      'java/claude-api.md',
      'php/claude-api.md',
      'python/agent-sdk/README.md',
      'python/agent-sdk/patterns.md',
      'python/claude-api/README.md',
      'python/claude-api/batches.md',
      'python/claude-api/files-api.md',
      'python/claude-api/streaming.md',
      'python/claude-api/tool-use.md',
      'ruby/claude-api.md',
      'shared/error-codes.md',
      'shared/live-sources.md',
      'shared/models.md',
      'shared/prompt-caching.md',
      'shared/tool-use-concepts.md',
      'typescript/agent-sdk/README.md',
      'typescript/agent-sdk/patterns.md',
      'typescript/claude-api/README.md',
      'typescript/claude-api/batches.md',
      'typescript/claude-api/files-api.md',
      'typescript/claude-api/streaming.md',
      'typescript/claude-api/tool-use.md',
    ]) {
      await mkdir(path.dirname(path.join(claudeApiDir, rel)), { recursive: true })
      if (!existsSync(path.join(claudeApiDir, rel))) {
        await writeFile(path.join(claudeApiDir, rel), `# Placeholder ${rel}\n`)
      }
    }
  }
}

await mkdir(outdir, { recursive: true })
await ensureSourceAssetPlaceholders()

const fullBundle = process.env.FULL_BUNDLE === '1'
const entryPoints = fullBundle
  ? [path.join(srcRoot, 'entrypoints/cli.tsx')]
  : await collectSourceEntrypoints(srcRoot)

await esbuild.build({
  entryPoints,
  outdir,
  outbase: root,
  bundle: fullBundle,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: false,
  minify: false,
  define: {
    'MACRO.VERSION': JSON.stringify(version),
    'MACRO.BUILD_TIME': JSON.stringify('dev'),
    'MACRO.PACKAGE_URL': JSON.stringify('claude-code-reconstructed'),
    'MACRO.NATIVE_PACKAGE_URL': JSON.stringify('claude-code-reconstructed-native'),
    'MACRO.FEEDBACK_CHANNEL': JSON.stringify(''),
    'MACRO.ISSUES_EXPLAINER': JSON.stringify(''),
    'MACRO.VERSION_CHANGELOG': JSON.stringify(''),
  },
  loader: {
    '.md': 'text',
    '.node': 'file',
  },
  external: fullBundle ? [
    '@ant/*',
    '@anthropic-ai/bedrock-sdk',
    '@anthropic-ai/claude-agent-sdk',
    '@anthropic-ai/foundry-sdk',
    '@anthropic-ai/mcpb',
    '@anthropic-ai/sandbox-runtime',
    '@anthropic-ai/vertex-sdk',
    '@aws-sdk/*',
    '@azure/identity',
    '@growthbook/growthbook',
    '@opentelemetry/*',
    '@smithy/*',
    'ajv',
    'undici',
    'usehooks-ts',
    'lru-cache',
    'proper-lockfile',
    'jsonc-parser/lib/esm/main.js',
    'env-paths',
    'emoji-regex',
    'get-east-asian-width',
    'strip-ansi',
    'wrap-ansi',
    'supports-hyperlinks',
    'figures',
    'cli-boxes',
    'cli-highlight',
    'highlight.js',
    'marked',
    'qrcode',
    'asciichart',
    'shell-quote',
    'signal-exit',
    'tree-kill',
    'cacache',
    'fflate',
    'plist',
    'xss',
    'turndown',
    'fuse.js',
    'p-map',
    'auto-bind',
    'stack-utils',
    'code-excerpt',
    'diff',
    'bidi-js',
    'type-fest',
    'audio-capture-napi',
    'audio-capture.node',
    'bun:ffi',
    'google-auth-library',
    'image-processor-napi',
    'modifiers-napi',
    'sharp',
    'url-handler-napi',
  ] : [],
  plugins: [
    {
      name: 'claude-code-reconstruction-shims',
      setup(build) {
        build.onResolve({ filter: /^bun:bundle$/ }, () => ({
          path: 'bun:bundle',
          namespace: 'bun-bundle-shim',
        }))

        build.onLoad({ filter: /.*/, namespace: 'bun-bundle-shim' }, () => ({
          loader: 'ts',
          contents: 'export function feature(_name: string): boolean { return false }\n',
        }))

        build.onResolve({ filter: /^src\/\// }, args => {
          const resolved = resolveSourcePath(path.join(srcRoot, args.path.replace(/^src\/+/, '')))
          return resolved ? { path: resolved } : undefined
        })

        build.onResolve({ filter: /^src\// }, args => {
          const resolved = resolveSourcePath(path.join(srcRoot, args.path.slice('src/'.length)))
          return resolved ? { path: resolved } : undefined
        })

        build.onResolve({ filter: /^\.\.?\// }, args => {
          if (!args.resolveDir.startsWith(srcRoot)) return undefined
          const resolved = resolveSourcePath(path.resolve(args.resolveDir, args.path))
          return resolved ? { path: resolved } : undefined
        })

        build.onLoad({ filter: /\.(ts|tsx)$/ }, async args => {
          if (!args.path.startsWith(srcRoot)) return undefined
          const source = await readFile(args.path, 'utf8')
          return {
            loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts',
            contents: transformSource(source, args.path),
          }
        })

        build.onLoad({ filter: /\.md$/ }, async args => {
          if (!existsSync(args.path)) {
            const relative = path.relative(root, args.path)
            return {
              loader: 'text',
              contents: `# Missing reconstructed markdown\n\nThis placeholder was generated during local reconstruction because ${relative} is not present in the source snapshot.\n`,
            }
          }
          return undefined
        })
      },
    },
  ],
})

if (!fullBundle) {
  await copySourceAssets(srcRoot)
}

console.log(`Built ${fullBundle ? path.relative(root, path.join(outdir, 'cli.js')) : path.relative(root, path.join(outdir, 'src/entrypoints/cli.js'))} (${version}, ${fullBundle ? 'bundled' : 'transpiled'})`)
