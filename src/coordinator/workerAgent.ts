import type { AgentDefinition } from '../tools/AgentTool/loadAgentsDir.js'

/**
 * Coordinator workers are not available in this reconstructed local build.
 * Keep the feature-gated import path safe by returning no extra agents rather
 * than exporting an empty object that callers may try to invoke.
 */
export function getCoordinatorAgents(): AgentDefinition[] {
  return []
}
