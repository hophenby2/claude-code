import { jsx } from "react/jsx-runtime";
import { Doctor } from "../../screens/Doctor.js";
const call = (onDone, _context, _args) => {
  return Promise.resolve(/* @__PURE__ */ jsx(Doctor, { onDone }));
};
export {
  call
};
