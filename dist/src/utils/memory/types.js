const feature = (_name) => false;
const MEMORY_TYPE_VALUES = [
  "User",
  "Project",
  "Local",
  "Managed",
  "AutoMem",
  ...false ? ["TeamMem"] : []
];
export {
  MEMORY_TYPE_VALUES
};
