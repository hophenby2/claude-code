// Reconstructed SDK control protocol type boundary.
// The original generated file is not present in this source snapshot. These
// aliases are deliberately broad to avoid over-constraining reconstructed
// transformed sources while the exact control protocol types are restored.

import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import type {
  SDKAssistantMessage,
  SDKMessage,
  SDKPartialAssistantMessage,
} from './coreTypes.js'

export type SDKControlInitializeRequest = any
export type SDKControlInitializeResponse = any
export type SDKControlPermissionRequest = {
  subtype: 'can_use_tool'
  tool_name: string
  input: Record<string, unknown>
  permission_suggestions?: any[]
  blocked_path?: string
  decision_reason?: string
  title?: string
  display_name?: string
  tool_use_id: string
  agent_id?: string
  description?: string
}
export type SDKControlRequestInner = any
export type SDKControlMcpSetServersResponse = {
  added: string[]
  removed: string[]
  errors: Record<string, string>
}
export type SDKControlReloadPluginsResponse = {
  commands: unknown[]
  agents: unknown[]
  plugins: { name: string; path: string; source?: string }[]
  mcpServers: unknown[]
  error_count: number
}
export type SDKControlRequest = any
export type SDKControlResponse = any
export type SDKControlCancelRequest = {
  type: 'control_cancel_request'
  request_id: string
}
export type SDKKeepAliveMessage = { type: 'keep_alive' }
export type SDKUpdateEnvironmentVariablesMessage = {
  type: 'update_environment_variables'
  variables: Record<string, string>
}
export type StdoutMessage = any
export type StdinMessage = any

export type BridgeState = any
export type BridgeConfig = any
export type ToolPermissionContext = any
export type ElicitResult = {
  action: 'accept' | 'decline' | 'cancel'
  content?: Record<string, unknown>
}
export type ReplBridgeHandle = any
export type BridgeApiClient = any

export type {
  JSONRPCMessage,
  SDKAssistantMessage,
  SDKMessage,
  SDKPartialAssistantMessage,
}
