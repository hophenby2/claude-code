import { useState } from "react";
import { major, minor, patch } from "semver";
function getSemverPart(version) {
  return `${major(version, { loose: true })}.${minor(version, { loose: true })}.${patch(version, { loose: true })}`;
}
function shouldShowUpdateNotification(updatedVersion, lastNotifiedSemver) {
  const updatedSemver = getSemverPart(updatedVersion);
  return updatedSemver !== lastNotifiedSemver;
}
function useUpdateNotification(updatedVersion, initialVersion = "0.0.0-dev") {
  const [lastNotifiedSemver, setLastNotifiedSemver] = useState(
    () => getSemverPart(initialVersion)
  );
  if (!updatedVersion) {
    return null;
  }
  const updatedSemver = getSemverPart(updatedVersion);
  if (updatedSemver !== lastNotifiedSemver) {
    setLastNotifiedSemver(updatedSemver);
    return updatedSemver;
  }
  return null;
}
export {
  getSemverPart,
  shouldShowUpdateNotification,
  useUpdateNotification
};
