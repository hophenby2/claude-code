import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..')
const srcRoot = path.join(root, 'src')
const outdir = path.join(root, 'dist')

const version = process.env.CLAUDE_CODE_RECONSTRUCTED_VERSION ?? '0.0.0-dev'

const enabledFeatures = new Set<string>([
  // Keep this set deliberately small. Most leaked/internal/native-heavy features
  // should stay disabled for a local smoke build.
])

function featureValue(name: string): string {
  return enabledFeatures.has(name) ? 'true' : 'false'
}

function transformFeatures(source: string): string {
  return source.replace(/\bfeature\(\s*(['"])([A-Z0-9_]+)\1\s*\)/g, (_match, _quote, name) => featureValue(name))
}

const buildResult = await (async () => {
  await mkdir(outdir, { recursive: true })

  return Bun.build({
    entrypoints: [path.join(srcRoot, 'entrypoints/cli.tsx')],
    outdir,
    target: 'bun',
    format: 'esm',
    splitting: false,
    sourcemap: 'none',
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
    },
    external: [
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
      'audio-capture-napi',
      'audio-capture.node',
      'bun:ffi',
      'google-auth-library',
      'image-processor-napi',
      'modifiers-napi',
      'sharp',
      'url-handler-napi',
    ],
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

          build.onResolve({ filter: /^src\/\// }, args => ({
            path: path.join(srcRoot, args.path.replace(/^src\/+/, '')),
          }))

          build.onResolve({ filter: /^src\// }, args => ({
            path: path.join(srcRoot, args.path.slice('src/'.length)),
          }))

          build.onLoad({ filter: /\.(ts|tsx)$/ }, async args => {
            if (!args.path.startsWith(srcRoot)) return undefined
            const source = await readFile(args.path, 'utf8')
            return {
              loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts',
              contents: transformFeatures(source),
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
})()

if (!buildResult.success) {
  for (const log of buildResult.logs) {
    console.error(log)
  }
  process.exit(1)
}

console.log(`Built ${path.relative(root, path.join(outdir, 'cli.js'))} (${version})`)
