function objectGroupBy(items, keySelector) {
  const result = /* @__PURE__ */ Object.create(null);
  let index = 0;
  for (const item of items) {
    const key = keySelector(item, index++);
    if (result[key] === void 0) {
      result[key] = [];
    }
    result[key].push(item);
  }
  return result;
}
export {
  objectGroupBy
};
