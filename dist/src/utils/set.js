function difference(a, b) {
  const result = /* @__PURE__ */ new Set();
  for (const item of a) {
    if (!b.has(item)) {
      result.add(item);
    }
  }
  return result;
}
function intersects(a, b) {
  if (a.size === 0 || b.size === 0) {
    return false;
  }
  for (const item of a) {
    if (b.has(item)) {
      return true;
    }
  }
  return false;
}
function every(a, b) {
  for (const item of a) {
    if (!b.has(item)) {
      return false;
    }
  }
  return true;
}
function union(a, b) {
  const result = /* @__PURE__ */ new Set();
  for (const item of a) {
    result.add(item);
  }
  for (const item of b) {
    result.add(item);
  }
  return result;
}
export {
  difference,
  every,
  intersects,
  union
};
