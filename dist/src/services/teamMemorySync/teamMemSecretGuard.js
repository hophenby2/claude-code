const feature = (_name) => false;
function checkTeamMemSecrets(filePath, content) {
  if (false) {
    const { isTeamMemPath } = null;
    const { scanForSecrets } = null;
    if (!isTeamMemPath(filePath)) {
      return null;
    }
    const matches = scanForSecrets(content);
    if (matches.length === 0) {
      return null;
    }
    const labels = matches.map((m) => m.label).join(", ");
    return `Content contains potential secrets (${labels}) and cannot be written to team memory. Team memory is shared with all repository collaborators. Remove the sensitive content and try again.`;
  }
  return null;
}
export {
  checkTeamMemSecrets
};
