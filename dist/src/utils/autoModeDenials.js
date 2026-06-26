const feature = (_name) => false;
let DENIALS = [];
const MAX_DENIALS = 20;
function recordAutoModeDenial(denial) {
  if (true) return;
  DENIALS = [denial, ...DENIALS.slice(0, MAX_DENIALS - 1)];
}
function getAutoModeDenials() {
  return DENIALS;
}
export {
  getAutoModeDenials,
  recordAutoModeDenial
};
