const alias = {
  name: "alias",
  description: "Create or list command aliases",
  args: {
    name: "definition",
    description: "Alias definition in the form name=value",
    isOptional: true,
    isVariadic: true
  }
};
var alias_default = alias;
export {
  alias_default as default
};
