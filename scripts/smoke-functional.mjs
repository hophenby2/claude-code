#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
globalThis.require ??= createRequire(path.join(root, 'dist/src/tools.js'))

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
    ['OverflowTestTool', '../dist/src/tools/OverflowTestTool/OverflowTestTool.js'],
  ]

  for (const [exportName, specifier] of toolModules) {
    const mod = await import(specifier)
    const tool = mod[exportName]
    assertToolShape(exportName, tool)
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

await check('build script does not write bundled skill placeholders back to src', async () => {
  const buildScriptPath = path.join(root, 'scripts/build.mjs')
  const source = await readFile(buildScriptPath, 'utf8')
  if (source.includes('await ensureSourceAssetPlaceholders(')) {
    throw new Error('scripts/build.mjs still calls ensureSourceAssetPlaceholders()')
  }
})

await check('tools registry imports and contains no empty objects', async () => {
  const mod = await import('../dist/src/tools.js')
  if (typeof mod.getAllBaseTools !== 'function') {
    throw new Error('getAllBaseTools is not exported')
  }

  const tools = mod.getAllBaseTools()
  if (!Array.isArray(tools) || tools.length === 0) {
    throw new Error('getAllBaseTools returned an empty or non-array value')
  }

  const bad = tools
    .map((tool, index) => ({ tool, index }))
    .filter(({ tool }) => !hasToolShape(tool))

  if (bad.length > 0) {
    throw new Error(`tools list contains invalid/empty entries at indexes: ${bad.map(x => x.index).join(', ')}`)
  }
})

await check('tasks registry imports and contains no empty objects', async () => {
  const mod = await import('../dist/src/tasks.js')
  if (typeof mod.getAllTasks !== 'function') {
    throw new Error('getAllTasks is not exported')
  }

  const tasks = mod.getAllTasks()
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('getAllTasks returned an empty or non-array value')
  }

  const bad = tasks
    .map((task, index) => ({ task, index }))
    .filter(
      ({ task }) =>
        !task ||
        typeof task !== 'object' ||
        Object.keys(task).length === 0 ||
        typeof task.type !== 'string',
    )

  if (bad.length > 0) {
    throw new Error(`tasks list contains invalid/empty entries at indexes: ${bad.map(x => x.index).join(', ')}`)
  }
})

await check('command registry imports and resolves a built-in command spec', async () => {
  const mod = await import('../dist/src/utils/bash/registry.js')
  if (typeof mod.getCommandSpec !== 'function') {
    throw new Error('getCommandSpec is not exported')
  }

  const spec = await mod.getCommandSpec('sleep')
  if (!spec || spec.name !== 'sleep') {
    throw new Error('command registry did not resolve the sleep command spec')
  }
})

function assertToolShape(name, tool) {
  if (!hasToolShape(tool)) {
    throw new Error(`${name} is missing required reconstructed tool shape`)
  }
}

function hasToolShape(tool) {
  if (!tool || typeof tool !== 'object' || Object.keys(tool).length === 0) {
    return false
  }
  return ['name', 'inputSchema', 'description', 'prompt', 'call', 'renderToolUseMessage', 'mapToolResultToToolResultBlockParam'].every(
    key => key in tool,
  )
}

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
