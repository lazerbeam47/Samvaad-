// state/stateDefinitions.js
module.exports = {
  STATES: {
    OPENING: "opening",
    DISCOVERY: "discovery",
    EXPLANATION: "explanation",
    OBJECTION: "objection",
    DECISION: "decision",
    CLOSING: "closing",
    ESCALATION: "escalation",
  },

  TRANSITIONS: {
    opening: ["discovery"],
    discovery: ["explanation", "objection"],
    explanation: ["decision", "objection"],
    objection: ["explanation", "escalation"],
    decision: ["closing", "escalation"],
    closing: [],
    escalation: [],
  },
};
