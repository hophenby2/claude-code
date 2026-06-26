import { jsx } from "react/jsx-runtime";
async function launchRepl(root, appProps, replProps, renderAndRun) {
  const {
    App
  } = await import("./components/App.js");
  const {
    REPL
  } = await import("./screens/REPL.js");
  await renderAndRun(root, /* @__PURE__ */ jsx(App, { ...appProps, children: /* @__PURE__ */ jsx(REPL, { ...replProps }) }));
}
export {
  launchRepl
};
