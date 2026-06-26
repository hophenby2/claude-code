function parseAddress(to) {
  if (to.startsWith("uds:")) return { scheme: "uds", target: to.slice(4) };
  if (to.startsWith("bridge:")) return { scheme: "bridge", target: to.slice(7) };
  if (to.startsWith("/")) return { scheme: "uds", target: to };
  return { scheme: "other", target: to };
}
export {
  parseAddress
};
