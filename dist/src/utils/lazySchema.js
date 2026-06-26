function lazySchema(factory) {
  let cached;
  return () => cached ??= factory();
}
export {
  lazySchema
};
