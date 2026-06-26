export const TungstenTool = {
  name: 'Tungsten',
  async description() {
    return 'Unavailable Tungsten placeholder tool for reconstructed local build'
  },
  async prompt() {
    return ''
  },
  inputJSONSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  isReadOnly() {
    return true
  },
  isEnabled() {
    return false
  },
  needsPermissions() {
    return false
  },
  async call() {
    throw new Error('TungstenTool is not available in the reconstructed local build')
  },
}
