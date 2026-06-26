import { logForDebugging } from "../utils/debug.js";
import { Stream } from "stream";
import Ink from "./ink.js";
import instances from "./instances.js";
const renderSync = (node, options) => {
  const opts = getOptions(options);
  const inkOptions = {
    stdout: process.stdout,
    stdin: process.stdin,
    stderr: process.stderr,
    exitOnCtrlC: true,
    patchConsole: true,
    ...opts
  };
  const instance = getInstance(
    inkOptions.stdout,
    () => new Ink(inkOptions)
  );
  instance.render(node);
  return {
    rerender: instance.render,
    unmount() {
      instance.unmount();
    },
    waitUntilExit: instance.waitUntilExit,
    cleanup: () => instances.delete(inkOptions.stdout)
  };
};
const wrappedRender = async (node, options) => {
  await Promise.resolve();
  const instance = renderSync(node, options);
  logForDebugging(
    `[render] first ink render: ${Math.round(process.uptime() * 1e3)}ms since process start`
  );
  return instance;
};
var root_default = wrappedRender;
async function createRoot({
  stdout = process.stdout,
  stdin = process.stdin,
  stderr = process.stderr,
  exitOnCtrlC = true,
  patchConsole = true,
  onFrame
} = {}) {
  await Promise.resolve();
  const instance = new Ink({
    stdout,
    stdin,
    stderr,
    exitOnCtrlC,
    patchConsole,
    onFrame
  });
  instances.set(stdout, instance);
  return {
    render: (node) => instance.render(node),
    unmount: () => instance.unmount(),
    waitUntilExit: () => instance.waitUntilExit()
  };
}
const getOptions = (stdout = {}) => {
  if (stdout instanceof Stream) {
    return {
      stdout,
      stdin: process.stdin
    };
  }
  return stdout;
};
const getInstance = (stdout, createInstance) => {
  let instance = instances.get(stdout);
  if (!instance) {
    instance = createInstance();
    instances.set(stdout, instance);
  }
  return instance;
};
export {
  createRoot,
  root_default as default,
  renderSync
};
