const heapDump = {
  type: "local",
  name: "heapdump",
  description: "Dump the JS heap to ~/Desktop",
  isHidden: true,
  supportsNonInteractive: true,
  load: () => import("./heapdump.js")
};
var heapdump_default = heapDump;
export {
  heapdump_default as default
};
