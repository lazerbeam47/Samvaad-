// Centralized per-session conversation state (phase/risk/opportunity/reason)

const state = {}; // { [sessionId]: { phase, risk, opportunity, reason } }

function initConversationState(sessionId, defaults = {}) {
  state[sessionId] = {
    phase: "UNKNOWN",
    risk: 0,
    opportunity: 0,
    reason: "",
    ...defaults,
  };
}

function getConversationState(sessionId) {
  return (
    state[sessionId] || {
      phase: "UNKNOWN",
      risk: 0,
      opportunity: 0,
      reason: "",
    }
  );
}

function updateConversationState(sessionId, next = {}) {
  const prev = getConversationState(sessionId);
  state[sessionId] = { ...prev, ...next };
  return state[sessionId];
}

function clearConversationState(sessionId) {
  delete state[sessionId];
}

module.exports = {
  initConversationState,
  getConversationState,
  updateConversationState,
  clearConversationState,
};
