import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
let _lockfile;
function getLockfile() {
  if (!_lockfile) {
    _lockfile = require2("proper-lockfile");
  }
  return _lockfile;
}
function lock(file, options) {
  return getLockfile().lock(file, options);
}
function lockSync(file, options) {
  return getLockfile().lockSync(file, options);
}
function unlock(file, options) {
  return getLockfile().unlock(file, options);
}
function check(file, options) {
  return getLockfile().check(file, options);
}
export {
  check,
  lock,
  lockSync,
  unlock
};
