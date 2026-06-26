const mobile = {
  type: "local-jsx",
  name: "mobile",
  aliases: ["ios", "android"],
  description: "Show QR code to download the Claude mobile app",
  load: () => import("./mobile.js")
};
var mobile_default = mobile;
export {
  mobile_default as default
};
