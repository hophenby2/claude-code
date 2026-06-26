function useMoreRight(_args) {
  return {
    onBeforeQuery: async () => true,
    onTurnComplete: async () => {
    },
    render: () => null
  };
}
export {
  useMoreRight
};
