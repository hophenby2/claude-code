const call = async () => {
  return {
    type: "text",
    value: "dev" ? `${"0.0.0-dev"} (built ${"dev"})` : "0.0.0-dev"
  };
};
const version = {
  type: "local",
  name: "version",
  description: "Print the version this session is running (not what autoupdate downloaded)",
  isEnabled: () => process.env.USER_TYPE === "ant",
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call })
};
var version_default = version;
export {
  version_default as default
};
