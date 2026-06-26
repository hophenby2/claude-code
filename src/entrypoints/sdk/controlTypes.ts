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
export type SDKControlPermissionRequest = any
export type SDKControlRequestInner = any
export type SDKControlMcpSetServersResponse = any
export type SDKControlReloadPluginsResponse = any
export type SDKControlRequest = any
export type SDKControlResponse = any
export type SDKControlCancelRequest = any
export type SDKKeepAliveMessage = any
export type SDKUpdateEnvironmentVariablesMessage = any
export type StdoutMessage = any
export type StdinMessage = any

export type BridgeState = any
export type BridgeConfig = any
export type ToolPermissionContext = any
export type ElicitResult = any
export type ReplBridgeHandle = any
export type BridgeApiClient = any

export type {
  JSONRPCMessage,
  SDKAssistantMessage,
  SDKMessage,
  SDKPartialAssistantMessage,
}
