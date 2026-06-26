const NO_VALUE = /* @__PURE__ */ Symbol("NO_VALUE");
async function lastX(as) {
  let lastValue = NO_VALUE;
  for await (const a of as) {
    lastValue = a;
  }
  if (lastValue === NO_VALUE) {
    throw new Error("No items in generator");
  }
  return lastValue;
}
async function returnValue(as) {
  let e;
  do {
    e = await as.next();
  } while (!e.done);
  return e.value;
}
async function* all(generators, concurrencyCap = Infinity) {
  const next = (generator) => {
    const promise = generator.next().then(({ done, value }) => ({
      done,
      value,
      generator,
      promise
    }));
    return promise;
  };
  const waiting = [...generators];
  const promises = /* @__PURE__ */ new Set();
  while (promises.size < concurrencyCap && waiting.length > 0) {
    const gen = waiting.shift();
    promises.add(next(gen));
  }
  while (promises.size > 0) {
    const { done, value, generator, promise } = await Promise.race(promises);
    promises.delete(promise);
    if (!done) {
      promises.add(next(generator));
      if (value !== void 0) {
        yield value;
      }
    } else if (waiting.length > 0) {
      const nextGen = waiting.shift();
      promises.add(next(nextGen));
    }
  }
}
async function toArray(generator) {
  const result = [];
  for await (const a of generator) {
    result.push(a);
  }
  return result;
}
async function* fromArray(values) {
  for (const value of values) {
    yield value;
  }
}
export {
  all,
  fromArray,
  lastX,
  returnValue,
  toArray
};
