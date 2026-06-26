import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
function parseYaml(input) {
  if (typeof Bun !== "undefined") {
    return Bun.YAML.parse(input);
  }
  return require2("yaml").parse(input);
}
export {
  parseYaml
};
