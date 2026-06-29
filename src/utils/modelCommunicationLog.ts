import { appendFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { getSessionId } from '../bootstrap/state.js'
import { redactSecrets } from '../services/teamMemorySync/secretScanner.js'
import { createBufferedWriter, type BufferedWriter } from './bufferedWriter.js'
import { registerCleanup } from './cleanupRegistry.js'
import { getClaudeConfigHomeDir, isEnvTruthy } from './envUtils.js'
import { jsonStringify } from './slowOperations.js'

export type ModelCommunicationDirection = 'outgoing' | 'incoming'

export type ModelCommunicationStage =
  | 'before_transform'
  | 'after_transform'
  | 'api_request'
  | 'api_stream_event'
  | 'api_response'
  | 'after_normalize'

export type ModelCommunicationEvent = {
  direction: ModelCommunicationDirection
  stage: ModelCommunicationStage
  source: string
  requestId?: string | null
  sequence?: number
  model?: string
  querySource?: unknown
  payload: unknown
}

type JsonlWriter = {
  write: (content: object) => void
  flush: () => void
  dispose: () => void
}

const EVENT_VERSION = 1
const DEFAULT_MAX_FIELD_CHARS = 20_000
const DEFAULT_MAX_EVENT_CHARS = 200_000
const MAX_DEPTH = 12
const MAX_ARRAY_ITEMS = 200
const MAX_OBJECT_KEYS = 200

const SENSITIVE_FIELD_RE =
  /^(api[_-]?key|apikey|x-api-key|authorization|auth|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|private[_-]?key|client[_-]?secret|cookie|set-cookie|bearer|credentials|session[_-]?token)$/i

const writerByPath = new Map<string, JsonlWriter>()

export function isModelCommunicationLogEnabled(): boolean {
  return isEnvTruthy(process.env.CLAUDE_CODE_LOG_MODEL_COMMUNICATION)
}

export function shouldLogFullStreamDeltas(): boolean {
  return isEnvTruthy(process.env.CLAUDE_CODE_MODEL_COMMUNICATION_LOG_STREAM_DELTAS)
}

export function logModelCommunicationEvent(
  event: ModelCommunicationEvent,
): void {
  if (!isModelCommunicationLogEnabled()) return

  try {
    const maxEventChars = getPositiveIntEnv(
      process.env.CLAUDE_CODE_MODEL_COMMUNICATION_LOG_MAX_EVENT_CHARS,
      DEFAULT_MAX_EVENT_CHARS,
    )
    const payload = sanitizeForLog(event.payload, {
      maxFieldChars: getPositiveIntEnv(
        process.env.CLAUDE_CODE_MODEL_COMMUNICATION_LOG_MAX_FIELD_CHARS,
        DEFAULT_MAX_FIELD_CHARS,
      ),
    })
    const logEvent = {
      timestamp: new Date().toISOString(),
      sessionId: getSessionId(),
      eventVersion: EVENT_VERSION,
      direction: event.direction,
      stage: event.stage,
      source: event.source,
      ...(event.requestId ? { requestId: event.requestId } : undefined),
      ...(event.sequence !== undefined ? { sequence: event.sequence } : undefined),
      ...(event.model ? { model: event.model } : undefined),
      ...(event.querySource !== undefined
        ? {
            querySource: sanitizeForLog(event.querySource, {
              maxFieldChars: DEFAULT_MAX_FIELD_CHARS,
            }),
          }
        : undefined),
      payload,
    }

    getWriter(getModelCommunicationLogPath()).write(
      fitEventToLimit(logEvent, maxEventChars),
    )
  } catch {
    // Model communication logging is diagnostics-only and must never affect the
    // request/stream/tool execution path.
  }
}

function getModelCommunicationLogPath(): string {
  const override = process.env.CLAUDE_CODE_MODEL_COMMUNICATION_LOG_FILE
  if (override) return override
  return join(
    getClaudeConfigHomeDir(),
    'model-communication',
    `${getSessionId()}.jsonl`,
  )
}

function getWriter(path: string): JsonlWriter {
  let writer = writerByPath.get(path)
  if (!writer) {
    const bufferedWriter: BufferedWriter = createBufferedWriter({
      writeFn: (content: string) => {
        mkdirSync(dirname(path), { recursive: true })
        appendFileSync(path, content)
      },
      flushIntervalMs: 1000,
      maxBufferSize: 50,
      maxBufferBytes: 256 * 1024,
    })
    writer = {
      write(content: object): void {
        bufferedWriter.write(jsonStringify(content) + '\n')
      },
      flush: bufferedWriter.flush,
      dispose: bufferedWriter.dispose,
    }
    writerByPath.set(path, writer)
    registerCleanup(async () => writer?.dispose())
  }
  return writer
}

function getPositiveIntEnv(value: string | undefined, defaultValue: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue
}

function fitEventToLimit<T extends { payload: unknown }>(event: T, limit: number): T {
  const serialized = safeStringify(event)
  if (serialized.length <= limit) return event

  const previewLength = Math.min(4000, Math.max(0, limit - 1000))
  const preview = safeStringify(event.payload).slice(0, previewLength)
  const compact = {
    ...event,
    payload: {
      note: 'payload exceeded max event size after redaction/truncation',
      originalSerializedChars: serialized.length,
      preview,
    },
  }
  if (safeStringify(compact).length <= limit) return compact

  return {
    ...event,
    payload: {
      note: 'payload omitted because event exceeded max size',
      originalSerializedChars: serialized.length,
    },
  }
}

function safeStringify(value: unknown): string {
  try {
    return jsonStringify(value)
  } catch {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
}

function sanitizeForLog(
  value: unknown,
  options: { maxFieldChars: number },
): unknown {
  return sanitizeValue(value, options, 0, new WeakSet<object>(), undefined)
}

function sanitizeValue(
  value: unknown,
  options: { maxFieldChars: number },
  depth: number,
  seen: WeakSet<object>,
  key: string | undefined,
): unknown {
  if (key && SENSITIVE_FIELD_RE.test(key)) return '<REDACTED:field>'
  if (depth > MAX_DEPTH) return `<TRUNCATED depth=${MAX_DEPTH}>`

  if (typeof value === 'string') return sanitizeString(value, options.maxFieldChars)
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value
  }
  if (value === undefined) return '<undefined>'
  if (typeof value === 'bigint') return `${value.toString()}n`
  if (typeof value === 'symbol') return value.toString()
  if (typeof value === 'function') return '<function>'

  if (value instanceof Error) {
    return {
      name: sanitizeString(value.name, options.maxFieldChars),
      message: sanitizeString(value.message, options.maxFieldChars),
      stack: value.stack ? sanitizeString(value.stack, options.maxFieldChars) : undefined,
    }
  }

  if (typeof Headers !== 'undefined' && value instanceof Headers) {
    const headers: Record<string, unknown> = {}
    for (const [headerKey, headerValue] of value.entries()) {
      headers[headerKey] = sanitizeValue(
        headerValue,
        options,
        depth + 1,
        seen,
        headerKey,
      )
    }
    return headers
  }

  if (typeof value !== 'object' || value === null) return String(value)
  if (seen.has(value)) return '<CIRCULAR>'
  seen.add(value)

  if (Array.isArray(value)) {
    const result = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map(item => sanitizeValue(item, options, depth + 1, seen, undefined))
    if (value.length > MAX_ARRAY_ITEMS) {
      result.push(`<TRUNCATED array_items=${value.length - MAX_ARRAY_ITEMS}>`)
    }
    seen.delete(value)
    return result
  }

  const result: Record<string, unknown> = {}
  const entries = Object.entries(value as Record<string, unknown>)
  for (const [entryKey, entryValue] of entries.slice(0, MAX_OBJECT_KEYS)) {
    result[entryKey] = sanitizeValue(
      entryValue,
      options,
      depth + 1,
      seen,
      entryKey,
    )
  }
  if (entries.length > MAX_OBJECT_KEYS) {
    result.__truncatedKeys = entries.length - MAX_OBJECT_KEYS
  }
  seen.delete(value)
  return result
}

function sanitizeString(value: string, maxFieldChars: number): string {
  const redacted = redactSecrets(value)
  if (redacted.length <= maxFieldChars) return redacted
  return `${redacted.slice(0, maxFieldChars)}<TRUNCATED chars=${redacted.length}>`
}

/** @internal */
export function _flushModelCommunicationLogWritersForTesting(): void {
  for (const writer of writerByPath.values()) writer.flush()
}

/** @internal */
export function _clearModelCommunicationLogWritersForTesting(): void {
  for (const writer of writerByPath.values()) writer.dispose()
  writerByPath.clear()
}
