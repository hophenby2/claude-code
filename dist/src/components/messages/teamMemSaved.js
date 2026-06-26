function teamMemSavedPart(message) {
  const count = message.teamCount ?? 0;
  if (count === 0) return null;
  return {
    segment: `${count} team ${count === 1 ? "memory" : "memories"}`,
    count
  };
}
export {
  teamMemSavedPart
};
