declare const MACRO: {
  VERSION: string
  BUILD_TIME: string
  PACKAGE_URL: string
  NATIVE_PACKAGE_URL: string
  FEEDBACK_CHANNEL: string
  ISSUES_EXPLAINER: string
  VERSION_CHANGELOG: string
}

declare const GateOverridesWarning: any
declare const ExperimentEnrollmentNotice: any

declare const TungstenPill: any

declare const Gates: any

declare const apiMetricsRef: any

declare function computeTtftText(...args: any[]): any

declare function fireCompanionObserver(...args: any[]): any

declare const UltraplanChoiceDialog: any

declare const UltraplanLaunchDialog: any

declare function launchUltraplan(...args: any[]): any

declare const HOOK_TIMING_DISPLAY_THRESHOLD_MS: number

type PromiseWithResolvers<T> = {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: any) => void
}

declare namespace React {
  type ReactNode = import('react').ReactNode
  type Dispatch<A> = import('react').Dispatch<A>
  type SetStateAction<S> = import('react').SetStateAction<S>
  type RefObject<T> = import('react').RefObject<T>
  type MutableRefObject<T> = import('react').MutableRefObject<T>
}

declare module '*.md' {
  const content: string
  export default content
}

declare module 'bun:bundle' {
  export function feature(name: string): boolean
}

declare module '@ant/computer-use-mcp' {
  export const API_RESIZE_PARAMS: any
  export const DEFAULT_GRANT_FLAGS: any
  export const targetImageSize: any
  export function bindSessionContext(...args: any[]): any
  export function buildComputerUseTools(...args: any[]): any
  export function createComputerUseMcpServer(...args: any[]): any
  export type ComputerExecutor = any
  export type ComputerUseSessionContext = any
  export type CuCallToolResult = any
  export type CuPermissionRequest = any
  export type CuPermissionResponse = any
  export type DisplayGeometry = any
  export type FrontmostApp = any
  export type InstalledApp = any
  export type ResolvePrepareCaptureResult = any
  export type RunningApp = any
  export type ScreenshotDims = any
  export type ScreenshotResult = any
  const value: any
  export default value
}

declare module '@ant/computer-use-mcp/types' {
  export type AccessibilityNode = any
  export type ComputerUseAction = any
  export type ComputerUseResult = any
  export type SentinelApp = any
  export type CuPermissionRequest = any
  export type CuPermissionResponse = any
  export type CoordinateMode = any
  export type ComputerUseHostAdapter = any
  export type CuSubGates = any
  export type Logger = any
  export const DEFAULT_GRANT_FLAGS: any
}

declare module '@ant/computer-use-mcp/sentinelApps' {
  export const SENTINEL_APPS: any
  export function getSentinelCategory(...args: any[]): any
}

declare module '@ant/claude-for-chrome-mcp' {
  export function createClaudeForChromeMcpServer(...args: any[]): any
  export type ClaudeForChromeContext = any
  export type Logger = any
  export type PermissionMode = any
  const value: any
  export default value
}

declare module '@anthropic-ai/mcpb' {
  export type McpbManifest = any
  export type McpbUserConfigurationOption = any
  export const PackageManager: any
  export const validatePackage: any
  export const pack: any
  export const unpack: any
}

declare module 'fuse.js' {
  const Fuse: any
  export default Fuse
}

declare module 'highlight.js' {
  const hljs: any
  export default hljs
}

declare module 'cli-highlight' {
  export const highlight: any
}

declare module 'image-processor-napi' {
  const value: any
  export default value
}

declare module 'audio-capture-napi' {
  const value: any
  export default value
}

declare module 'sharp' {
  const sharp: any
  export default sharp
}

declare module 'google-auth-library' {
  export const GoogleAuth: any
}

declare module 'vscode-languageserver-protocol' {
  export const ProposedFeatures: any
  export const createConnection: any
  export const InitializeRequest: any
  export const DidOpenTextDocumentNotification: any
  export const DidChangeTextDocumentNotification: any
  export const DidCloseTextDocumentNotification: any
  export const TextDocumentSyncKind: any
  export type InitializeParams = any
  export type InitializeResult = any
  export type ServerCapabilities = any
  export type PublishDiagnosticsParams = any
  export type Diagnostic = any
  export type CompletionItem = any
  export type Hover = any
  export type Location = any
}

declare module 'vscode-languageserver-types' {
  export type Position = any
  export type Range = any
  export type SymbolInformation = any
  export type LocationLink = any
  export type Location = any
  export type Hover = any
  export type DocumentSymbol = any
  export type CallHierarchyOutgoingCall = any
  export type CallHierarchyItem = any
  export type CallHierarchyIncomingCall = any
  export type SymbolKind = any
  export type MarkupContent = any
  export type MarkedString = any
}

declare module 'vscode-jsonrpc/node.js' {
  export const StreamMessageReader: any
  export const StreamMessageWriter: any
  export const createMessageConnection: any
  export const Trace: any
  export type MessageConnection = any
}

declare module 'asciichart' {
  export const plot: any
  const asciichart: any
  export default asciichart
}

declare module 'plist' {
  const plist: any
  export default plist
}

declare module 'cacache' {
  const cacache: any
  export default cacache
}

declare module 'fflate' {
  export const unzipSync: any
  export const zipSync: any
}

declare module 'proper-lockfile' {
  export type CheckOptions = any
  export type LockOptions = any
  export type UnlockOptions = any
  export const lock: any
  export const unlock: any
}

declare module 'url-handler-napi' {
  const value: any
  export default value
}

declare module '@aws-sdk/client-bedrock' {
  export const BedrockClient: any
  export const ListInferenceProfilesCommand: any
  export const ListFoundationModelsCommand: any
}

declare module '@aws-sdk/client-bedrock-runtime' {
  export type CountTokensCommandInput = any
  export const BedrockRuntimeClient: any
  export const ConverseCommand: any
  export const ConverseStreamCommand: any
}

declare module '@aws-sdk/client-sts' {
  export const STSClient: any
  export const GetCallerIdentityCommand: any
}

declare module '@aws-sdk/credential-provider-node' {
  export const defaultProvider: any
}

declare module '@aws-sdk/credential-providers' {
  export const fromNodeProviderChain: any
}

declare module '@smithy/core' {
  export const getSmithyContext: any
}

declare module '@smithy/node-http-handler' {
  export const NodeHttpHandler: any
}

declare module '@azure/identity' {
  export const DefaultAzureCredential: any
}

declare module '@anthropic-ai/bedrock-sdk' {
  const value: any
  export default value
}

declare module '@anthropic-ai/foundry-sdk' {
  const value: any
  export default value
}

declare module '@anthropic-ai/vertex-sdk' {
  const value: any
  export default value
}

declare module '@ant/computer-use-input' {
  export type ComputerUseInput = any
  export type ComputerUseInputAPI = any
  const value: any
  export default value
}

declare module '@ant/computer-use-swift' {
  export type ComputerUseAPI = any
  const value: any
  export default value
}

declare module '@opentelemetry/exporter-logs-otlp-grpc' {
  export const OTLPLogExporter: any
}

declare module '@opentelemetry/exporter-logs-otlp-proto' {
  export const OTLPLogExporter: any
}

declare module '@opentelemetry/exporter-metrics-otlp-grpc' {
  export const OTLPMetricExporter: any
}

declare module '@opentelemetry/exporter-metrics-otlp-http' {
  export const OTLPMetricExporter: any
}

declare module '@opentelemetry/exporter-metrics-otlp-proto' {
  export const OTLPMetricExporter: any
}

declare module '@opentelemetry/exporter-prometheus' {
  export const PrometheusExporter: any
}

declare module '@opentelemetry/exporter-trace-otlp-grpc' {
  export const OTLPTraceExporter: any
}

declare module '@opentelemetry/exporter-trace-otlp-proto' {
  export const OTLPTraceExporter: any
}
