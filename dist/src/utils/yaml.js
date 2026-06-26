function parseYaml(input) {
  if (typeof Bun !== "undefined") {
    return Bun.YAML.parse(input);
  }
  return require("yaml").parse(input);
}
export {
  parseYaml
};
