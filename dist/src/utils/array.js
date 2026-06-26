function intersperse(as, separator) {
  return as.flatMap((a, i) => i ? [separator(i), a] : [a]);
}
function count(arr, pred) {
  let n = 0;
  for (const x of arr) n += +!!pred(x);
  return n;
}
function uniq(xs) {
  return [...new Set(xs)];
}
export {
  count,
  intersperse,
  uniq
};
