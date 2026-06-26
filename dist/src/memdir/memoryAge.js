function memoryAgeDays(mtimeMs) {
  return Math.max(0, Math.floor((Date.now() - mtimeMs) / 864e5));
}
function memoryAge(mtimeMs) {
  const d = memoryAgeDays(mtimeMs);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}
function memoryFreshnessText(mtimeMs) {
  const d = memoryAgeDays(mtimeMs);
  if (d <= 1) return "";
  return `This memory is ${d} days old. Memories are point-in-time observations, not live state \u2014 claims about code behavior or file:line citations may be outdated. Verify against current code before asserting as fact.`;
}
function memoryFreshnessNote(mtimeMs) {
  const text = memoryFreshnessText(mtimeMs);
  if (!text) return "";
  return `<system-reminder>${text}</system-reminder>
`;
}
export {
  memoryAge,
  memoryAgeDays,
  memoryFreshnessNote,
  memoryFreshnessText
};
