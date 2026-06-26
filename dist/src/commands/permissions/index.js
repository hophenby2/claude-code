const permissions = {
  type: "local-jsx",
  name: "permissions",
  aliases: ["allowed-tools"],
  description: "Manage allow & deny tool permission rules",
  load: () => import("./permissions.js")
};
var permissions_default = permissions;
export {
  permissions_default as default
};
