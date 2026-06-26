#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const checks = []

async function check(name, fn) {
  try {
    await fn()
    checks.push({ name, ok: true })
  } catch (error) {
    checks.push({ name, ok: false, error })
  }
}

await check('built CLI exists and has node shebang', async () => {
  const cliPath = path.join(root, 'dist/src/entrypoints/cli.js')
  await access(cliPath)
  const source = await readFile(cliPath, 'utf8')
  if (!source.startsWith('#!/usr/bin/env node')) {
    throw new Error(`${path.relative(root, cliPath)} is missing #!/usr/bin/env node`)
  }
})

await check('stub tools export non-empty reconstructed tool objects', async () => {
  const toolModules = [
    ['WorkflowTool', '../dist/src/tools/WorkflowTool/WorkflowTool.js'],
    ['MonitorTool', '../dist/src/tools/MonitorTool/MonitorTool.js'],
    ['ReviewArtifactTool', '../dist/src/tools/ReviewArtifactTool/ReviewArtifactTool.js'],
  ]

  for (const [exportName, specifier] of toolModules) {
    const mod = await import(specifier)
    const tool = mod[exportName]
    if (!tool || typeof tool !== 'object') {
      throw new Error(`${exportName} did not export an object`)
    }
    for (const key of ['name', 'inputSchema', 'description', 'prompt', 'call', 'renderToolUseMessage', 'mapToolResultToToolResultBlockParam']) {
      if (!(key in tool)) throw new Error(`${exportName} is missing ${key}`)
    }
    if (typeof tool.isEnabled !== 'function' || tool.isEnabled() !== false) {
      throw new Error(`${exportName} must be explicitly disabled in reconstructed builds`)
    }
  }
})

await check('bundled skill placeholders are emitted to dist only', async () => {
  const placeholderPath = path.join(root, 'dist/src/skills/bundled/claude-api/SKILL.md')
  await access(placeholderPath)
  const source = await readFile(placeholderPath, 'utf8')
  if (!source.includes('Placeholder')) {
    throw new Error(`${path.relative(root, placeholderPath)} should document placeholder content`)
  }
})

const failed = checks.filter(check => !check.ok)
for (const result of checks) {
  if (result.ok) {
    console.log(`✓ ${result.name}`)
  } else {
    console.error(`✗ ${result.name}`)
    console.error(result.error instanceof Error ? result.error.message : String(result.error))
  }
}

if (failed.length > 0) {
  process.exitCode = 1
}
