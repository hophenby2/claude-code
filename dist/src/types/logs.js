function sortLogs(logs) {
  return logs.sort((a, b) => {
    const modifiedDiff = b.modified.getTime() - a.modified.getTime();
    if (modifiedDiff !== 0) {
      return modifiedDiff;
    }
    return b.created.getTime() - a.created.getTime();
  });
}
export {
  sortLogs
};
