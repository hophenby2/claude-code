import type { Command } from '../../types/command.js'

const command: Command = {
  type: 'local-jsx',
  name: 'buddy',
  description: 'Buddy commands are not available in this reconstructed build.',
  isEnabled: () => false,
  load: async () => ({
    async call() {
      return null
    },
  }),
}

export default command
