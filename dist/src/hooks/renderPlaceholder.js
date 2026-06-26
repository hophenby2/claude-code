import chalk from "chalk";
function renderPlaceholder({
  placeholder,
  value,
  showCursor,
  focus,
  terminalFocus = true,
  invert = chalk.inverse,
  hidePlaceholderText = false
}) {
  let renderedPlaceholder = void 0;
  if (placeholder) {
    if (hidePlaceholderText) {
      renderedPlaceholder = showCursor && focus && terminalFocus ? invert(" ") : "";
    } else {
      renderedPlaceholder = chalk.dim(placeholder);
      if (showCursor && focus && terminalFocus) {
        renderedPlaceholder = placeholder.length > 0 ? invert(placeholder[0]) + chalk.dim(placeholder.slice(1)) : invert(" ");
      }
    }
  }
  const showPlaceholder = value.length === 0 && Boolean(placeholder);
  return {
    renderedPlaceholder,
    showPlaceholder
  };
}
export {
  renderPlaceholder
};
