import { z } from "zod/v4";
import { lazySchema } from "../../utils/lazySchema.js";
const ConfigScopeSchema = lazySchema(
  () => z.enum([
    "local",
    "user",
    "project",
    "dynamic",
    "enterprise",
    "claudeai",
    "managed"
  ])
);
const TransportSchema = lazySchema(
  () => z.enum(["stdio", "sse", "sse-ide", "http", "ws", "sdk"])
);
const McpStdioServerConfigSchema = lazySchema(
  () => z.object({
    type: z.literal("stdio").optional(),
    // Optional for backwards compatibility
    command: z.string().min(1, "Command cannot be empty"),
    args: z.array(z.string()).default([]),
    env: z.record(z.string(), z.string()).optional()
  })
);
const McpXaaConfigSchema = lazySchema(() => z.boolean());
const McpOAuthConfigSchema = lazySchema(
  () => z.object({
    clientId: z.string().optional(),
    callbackPort: z.number().int().positive().optional(),
    authServerMetadataUrl: z.string().url().startsWith("https://", {
      message: "authServerMetadataUrl must use https://"
    }).optional(),
    xaa: McpXaaConfigSchema().optional()
  })
);
const McpSSEServerConfigSchema = lazySchema(
  () => z.object({
    type: z.literal("sse"),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
    headersHelper: z.string().optional(),
    oauth: McpOAuthConfigSchema().optional()
  })
);
const McpSSEIDEServerConfigSchema = lazySchema(
  () => z.object({
    type: z.literal("sse-ide"),
    url: z.string(),
    ideName: z.string(),
    ideRunningInWindows: z.boolean().optional()
  })
);
const McpWebSocketIDEServerConfigSchema = lazySchema(
  () => z.object({
    type: z.literal("ws-ide"),
    url: z.string(),
    ideName: z.string(),
    authToken: z.string().optional(),
    ideRunningInWindows: z.boolean().optional()
  })
);
const McpHTTPServerConfigSchema = lazySchema(
  () => z.object({
    type: z.literal("http"),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
    headersHelper: z.string().optional(),
    oauth: McpOAuthConfigSchema().optional()
  })
);
const McpWebSocketServerConfigSchema = lazySchema(
  () => z.object({
    type: z.literal("ws"),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
    headersHelper: z.string().optional()
  })
);
const McpSdkServerConfigSchema = lazySchema(
  () => z.object({
    type: z.literal("sdk"),
    name: z.string()
  })
);
const McpClaudeAIProxyServerConfigSchema = lazySchema(
  () => z.object({
    type: z.literal("claudeai-proxy"),
    url: z.string(),
    id: z.string()
  })
);
const McpServerConfigSchema = lazySchema(
  () => z.union([
    McpStdioServerConfigSchema(),
    McpSSEServerConfigSchema(),
    McpSSEIDEServerConfigSchema(),
    McpWebSocketIDEServerConfigSchema(),
    McpHTTPServerConfigSchema(),
    McpWebSocketServerConfigSchema(),
    McpSdkServerConfigSchema(),
    McpClaudeAIProxyServerConfigSchema()
  ])
);
const McpJsonConfigSchema = lazySchema(
  () => z.object({
    mcpServers: z.record(z.string(), McpServerConfigSchema())
  })
);
export {
  ConfigScopeSchema,
  McpClaudeAIProxyServerConfigSchema,
  McpHTTPServerConfigSchema,
  McpJsonConfigSchema,
  McpSSEIDEServerConfigSchema,
  McpSSEServerConfigSchema,
  McpSdkServerConfigSchema,
  McpServerConfigSchema,
  McpStdioServerConfigSchema,
  McpWebSocketIDEServerConfigSchema,
  McpWebSocketServerConfigSchema,
  TransportSchema
};
