async function call(_args, context) {
  if (context.openMessageSelector) {
    context.openMessageSelector();
  }
  return { type: "skip" };
}
export {
  call
};
