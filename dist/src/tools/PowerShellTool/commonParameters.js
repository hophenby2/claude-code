const COMMON_SWITCHES = ["-verbose", "-debug"];
const COMMON_VALUE_PARAMS = [
  "-erroraction",
  "-warningaction",
  "-informationaction",
  "-progressaction",
  "-errorvariable",
  "-warningvariable",
  "-informationvariable",
  "-outvariable",
  "-outbuffer",
  "-pipelinevariable"
];
const COMMON_PARAMETERS = /* @__PURE__ */ new Set([
  ...COMMON_SWITCHES,
  ...COMMON_VALUE_PARAMS
]);
export {
  COMMON_PARAMETERS,
  COMMON_SWITCHES,
  COMMON_VALUE_PARAMS
};
