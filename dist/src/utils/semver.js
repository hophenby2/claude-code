let _npmSemver;
function getNpmSemver() {
  if (!_npmSemver) {
    _npmSemver = require("semver");
  }
  return _npmSemver;
}
function gt(a, b) {
  if (typeof Bun !== "undefined") {
    return Bun.semver.order(a, b) === 1;
  }
  return getNpmSemver().gt(a, b, { loose: true });
}
function gte(a, b) {
  if (typeof Bun !== "undefined") {
    return Bun.semver.order(a, b) >= 0;
  }
  return getNpmSemver().gte(a, b, { loose: true });
}
function lt(a, b) {
  if (typeof Bun !== "undefined") {
    return Bun.semver.order(a, b) === -1;
  }
  return getNpmSemver().lt(a, b, { loose: true });
}
function lte(a, b) {
  if (typeof Bun !== "undefined") {
    return Bun.semver.order(a, b) <= 0;
  }
  return getNpmSemver().lte(a, b, { loose: true });
}
function satisfies(version, range) {
  if (typeof Bun !== "undefined") {
    return Bun.semver.satisfies(version, range);
  }
  return getNpmSemver().satisfies(version, range, { loose: true });
}
function order(a, b) {
  if (typeof Bun !== "undefined") {
    return Bun.semver.order(a, b);
  }
  return getNpmSemver().compare(a, b, { loose: true });
}
export {
  gt,
  gte,
  lt,
  lte,
  order,
  satisfies
};
