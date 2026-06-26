const DENIAL_LIMITS = {
  maxConsecutive: 3,
  maxTotal: 20
};
function createDenialTrackingState() {
  return {
    consecutiveDenials: 0,
    totalDenials: 0
  };
}
function recordDenial(state) {
  return {
    ...state,
    consecutiveDenials: state.consecutiveDenials + 1,
    totalDenials: state.totalDenials + 1
  };
}
function recordSuccess(state) {
  if (state.consecutiveDenials === 0) return state;
  return {
    ...state,
    consecutiveDenials: 0
  };
}
function shouldFallbackToPrompting(state) {
  return state.consecutiveDenials >= DENIAL_LIMITS.maxConsecutive || state.totalDenials >= DENIAL_LIMITS.maxTotal;
}
export {
  DENIAL_LIMITS,
  createDenialTrackingState,
  recordDenial,
  recordSuccess,
  shouldFallbackToPrompting
};
