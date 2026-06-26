import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { WORKFLOW_TOOL_NAME } from './constants.js'

const inputSchema = z.strictObject({})
type InputSchema = typeof inputSchema

type Output = {
  message: string
}

const unavailableMessage =
  'Workflow scripts are not available in this reconstructed build.'

export const WorkflowTool = buildTool({
  name: WORKFLOW_TOOL_NAME,
  searchHint: 'run workflow scripts',
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

export default WorkflowTool
