import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'

const inputSchema = z.strictObject({})
type InputSchema = typeof inputSchema

type Output = {
  message: string
}

const unavailableMessage =
  'Review artifacts are not available in this reconstructed build.'

export const ReviewArtifactTool = buildTool({
  name: 'ReviewArtifact',
  searchHint: 'create review artifact',
  maxResultSizeChars: 10_000,
  isEnabled() {
    return false
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  get inputSchema(): InputSchema {
    return inputSchema
  },
  async description() {
    return unavailableMessage
  },
  async prompt() {
    return unavailableMessage
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: output.message,
    }
  },
  renderToolUseMessage() {
    return unavailableMessage
  },
  async call() {
    throw new Error(unavailableMessage)
  },
} satisfies ToolDef<InputSchema, Output>)

export default ReviewArtifactTool
