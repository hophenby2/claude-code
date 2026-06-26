function expandEnvVarsInString(value) {
  const missingVars = [];
  const expanded = value.replace(/\$\{([^}]+)\}/g, (match, varContent) => {
    const [varName, defaultValue] = varContent.split(":-", 2);
    const envValue = process.env[varName];
    if (envValue !== void 0) {
      return envValue;
    }
    if (defaultValue !== void 0) {
      return defaultValue;
    }
    missingVars.push(varName);
    return match;
  });
  return {
    expanded,
    missingVars
  };
}
export {
  expandEnvVarsInString
};
