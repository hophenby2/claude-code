import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'

const inputSchema = z.strictObject({})
type InputSchema = typeof inputSchema

type Output = {
  message: string
}

const unavailableMessage =
  'Overflow testing is not available in this reconstructed build.'

export const OverflowTestTool = buildTool({
  name: 'OverflowTest',
  searchHint: 'exercise overflow handling',
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

export default OverflowTestTool
