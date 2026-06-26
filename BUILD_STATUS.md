# Build Status

## Snapshot

- Package: `claude-code-reconstructed` at `0.0.0-dev`.
- Canonical build script: `npm run build` → `node scripts/build.mjs`.
- Canonical CLI output: `dist/src/entrypoints/cli.js`.
- Current package bin: `claude-code-reconstructed` → `./dist/src/entrypoints/cli.js`.
- Current validation scripts:
  - `npm run smoke` → `node dist/src/entrypoints/cli.js --version`
  - `npm run smoke:bin` → `dist/src/entrypoints/cli.js --version`
  - `npm run smoke:functional` → `node scripts/smoke-functional.mjs`
  - `npm run syntaxcheck` → `tsc --noEmit --noCheck`
  - `npm run typecheck` → `tsc --noEmit`
- `dist/cli.js` may exist as a legacy or full-bundle artifact; do not treat it as the default entrypoint.

## Current Build Chain

- `scripts/build.mjs` is the supported Node + esbuild build script wired from `package.json`.
- `scripts/build.ts` is a legacy/unused Bun-style script and is not called by the npm build script.
- `npm run build` should only write build outputs under `dist/`; it no longer creates missing bundled-skill placeholder files under `src/`.
- Missing bundled skill Markdown is still represented by placeholder output under `dist/` so the reconstructed build shape remains usable.
- The built CLI entrypoint is made executable and must include `#!/usr/bin/env node` for package-bin execution.

## Completed Work

- npm package scaffold exists: `package.json`, `package-lock.json`, and installed dependencies.
- TypeScript config exists at `tsconfig.json`.
- Source tree is broadly restored under `src/`, including CLI entrypoints, TUI/query code, tools, services, commands, MCP-related modules, bridge-related modules, plugins, and bundled skills structure.
- Build artifacts are emitted under `dist/`.
- Version smoke and direct-bin smoke are available for `dist/src/entrypoints/cli.js`.
- Several missing reconstructed type-boundary files and ambient declarations exist to keep module boundaries stable while precise types are restored in later passes.
- Feature-gated tool stubs for workflow, monitor, and review-artifact paths now export explicit disabled tool objects instead of empty objects.

## Known Gaps and Risks

### Reconstructed Type Boundaries

`npm run typecheck` is not yet a reliable quality gate. The project still relies on broad reconstructed boundaries such as:

- `src/global.d.ts`
- `src/entrypoints/sdk/coreTypes.generated.ts`
- `src/entrypoints/sdk/controlTypes.ts`
- `src/types/message.ts`
- `src/types/tools.ts`

Do not continue broadening these core protocol boundaries just to silence errors. Future work should narrow SDK/control/message/tool types in small, verified batches.

### Disabled or Placeholder Features

Several subsystems are intentionally unavailable or incomplete in this reconstructed build, including workflows, peers, assistant paths, monitor/review-artifact tools, some server/daemon flows, and bundled skill content.

Command stubs should remain explicitly disabled with user-facing descriptions. Tool stubs should not be exported as bare `{}` objects because callers expect a complete tool shape.

### Bundled Skills

Bundled skill directories exist, but many Markdown files are placeholders. This is sufficient for build-shape restoration but not for complete skill behavior. Restoring full `verify`, `claude-api`, and example content remains deferred.

### Test Coverage

The current verification surface is still minimal. Version smoke, bin smoke, functional smoke, build, syntaxcheck, and typecheck baseline are not a substitute for full unit/integration/end-to-end coverage.

## Validation Matrix

| Step | Command | Expected Result |
| --- | --- | --- |
| Build | `npm run build` | Succeeds under Node, emits `dist/src/entrypoints/cli.js`, and does not write `src/**` placeholders |
| Version smoke | `npm run smoke` | Prints `0.0.0-dev (Claude Code)` |
| Bin smoke | `npm run smoke:bin` | Executes the built CLI directly and prints `0.0.0-dev (Claude Code)` |
| Functional smoke | `npm run smoke:functional` | Verifies CLI shebang, disabled stub tools, and emitted placeholder skill assets |
| Syntax/module check | `npm run syntaxcheck` | Passes with `tsc --noEmit --noCheck` |
| Type baseline | `npm run typecheck` | Run and record the result; do not treat as a release gate yet |

## Deferred Work

- Restoring complete bundled skill content for `verify`, `claude-api`, and examples.
- Enabling or validating feature-gated/internal capabilities such as workflows, peers, assistant, monitor, review-artifact, server/daemon, and native/provider paths.
- Redesigning the full `dist` layout or deleting extra/legacy outputs.
- Adding a comprehensive test suite beyond build/smoke/syntaxcheck/typecheck validation.
- Reducing `any` and `@ts-nocheck` in focused batches, starting with SDK/control/message/tool protocol boundaries.
- Deciding whether `dist/` is committed or purely generated; avoid mixing that decision with source repairs.

## Follow-up Notes

- Keep `dist/src/entrypoints/cli.js` as the canonical built CLI entrypoint because it matches `package.json` and all smoke scripts.
- Treat `dist/cli.js` as an extra/legacy artifact until its purpose is confirmed.
- Do not treat broad ambient declarations as restored functionality; they are reconstruction boundaries.
- Prefer small, measurable follow-up batches: build determinism, dependency manifest accuracy, stub smoke coverage, then type-boundary narrowing.
