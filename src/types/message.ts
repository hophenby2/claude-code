// Reconstructed internal message type boundary.
// The original source snapshot is missing this file; broad aliases keep the
// recovered source connected while precise unions are restored later.

export type AgentId = string
export type AppState = any
export type AssistantMessage = any
export type Attachment = any
export type AttachmentMessage<T = any> = any
export type AttributionSnapshotMessage = any
export type CollapsedReadSearchGroup = any
export type CompletionBoundary = any
export type GroupedToolUseMessage = any
export type HookResultMessage = any
export type Message = any
export type MessageOrigin =
  | { kind: 'coordinator' }
  | { kind: 'task-notification' }
export type CompactMetadata = any
export type CollapsibleMessage = any
export type SystemAgentsKilledMessage = any
export type SystemApiMetricsMessage = any
export type SystemAwaySummaryMessage = any
export type SystemFileSnapshotMessage = any
export type SystemMicrocompactBoundaryMessage = any
export type SystemPermissionRetryMessage = any
export type SystemScheduledTaskFireMessage = any
export type SystemMessageLevel = 'info' | 'warning' | 'error' | 'suggestion'
export type NormalizedAssistantMessage<T = any> = any
export type NormalizedMessage = any
export type NormalizedUserMessage = any
export type PartialCompactDirection = 'from' | 'up_to'
export type ProgressMessage<T = any> = any
export type RequestStartEvent = any
export type StreamEvent = any
export type ToolUseSummaryMessage = any
export type TombstoneMessage = any
export type StopHookInfo = {
  command: string
  promptText?: string
  durationMs?: number
}
export type SystemCompactBoundaryMessage = any
export type SystemLocalCommandMessage = any
export type SystemInformationalMessage = any
export type QuerySource = string
export type RenderableMessage = any
export type SystemAPIErrorMessage = any
export type SystemBridgeStatusMessage = any
export type SystemMemorySavedMessage = any
export type SystemMessage = any
export type SystemStopHookSummaryMessage = any
export type SystemThinkingMessage = any
export type SystemTurnDurationMessage = any
export type TaskStateBase = any
export type ToolUseConfirm = any
export type ToolUseContext = any
export type UserMessage = any

export type {
  AccountInfo,
  AgentDefinition,
  HookEvent,
  HookJSONOutput,
  ModelUsage,
  PermissionMode,
  PermissionResult,
  SDKAssistantMessage,
  SDKCompactBoundaryMessage,
  SDKMessage,
  SDKPartialAssistantMessage,
  SDKResultMessage,
  SDKStatusMessage,
  SDKSystemMessage,
} from '../entrypoints/agentSdkTypes.js'
