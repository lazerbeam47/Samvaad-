// processor.js - NLU processing module which uses conversationStore to manage transcripts and sessions
const { run } = require("./llmClient"); // Importing run function from llmClient module
const buildMasterPrompt = require("./prompts/masterPrompt"); // Importing prompt builder
const conversationStore = require("../services/conversationStore"); // Importing conversation store service
const Events = require("../sockets/events"); // Importing socket events definitions
const logger = require("../utils/logger"); // Importing custom logger utility
const { parse } = require("path");

// //debounce map for each session because multiple chunks can arrive in quick succession
// const pending = {}; // In-memory store for pending processing per session

// function scheduleNluProcessing(io, sessionId, delay = 2000) {
//   // Schedule NLU processing after a delay
//   if (pending[sessionId]) clearTimeout(pending[sessionId]); // Clear existing timeout if any

//   pending[sessionId] = setTimeout(() => runNlu(io, sessionId), delay); // Schedule new timeout
// }
const conversationState = {}; // In-memory store for previous conversation states
async function runNlu(io, sessionId) {
  // Run NLU processing
  const transcript = conversationStore.getTranscript(sessionId) || ""; // Retrieve transcript for session
  if (!transcript.trim()) return; // No transcript to process
  console.log("Running NLU for session:", sessionId);
  const prompt = buildMasterPrompt(transcript); // Build prompt using transcript
  const raw = await run(prompt); // Get raw response from LLM
  if (!raw) return; // No response from LLM
  console.log("🔥 RAW GEMINI OUTPUT:\n", raw);

  let parsed = null;
  try {
    parsed = JSON.parse(raw); // Attempt to parse JSON response
  } catch {
    const match = raw.match(/{[\s\S]*}/); // Try to extract JSON substring
    if (match) {
      try {
        parsed = JSON.parse(match[0]); // Parse extracted JSON
      } catch (err) {
        logger.error("NLU JSON parse error after extraction:", err);
        return;
      }
    } else {
      logger.error("NLU JSON parse error, no JSON found");
      return;
    }
  }
  const {
    intent = {},
    suggestions = [],
    compliance = [],
    crm = {},
    actions = [],
    conversation_state = {},
  } = parsed;

  console.log(`[NLU] Emitting intent: ${JSON.stringify(intent)}`);
  io.to(sessionId).emit(Events.AGENT_INTENT, { intent });

  console.log(`[NLU] Emitting suggestions (${suggestions.length})`);
  io.to(sessionId).emit(Events.AGENT_SUGGESTIONS, { suggestions });

  if (compliance.length) {
    console.log(`[NLU] Emitting compliance (${compliance.length})`);
    io.to(sessionId).emit(Events.AGENT_COMPLIANCE, { flags: compliance });
  } else {
    console.log("[NLU] No compliance flags");
  }

  if (Object.keys(crm).length) {
    console.log(`[NLU] Emitting CRM fields (${Object.keys(crm).length})`);
    io.to(sessionId).emit(Events.AGENT_CRM, { fields: crm });
  } else {
    console.log("[NLU] No CRM fields");
  }

  if (actions.length) {
    console.log(`[NLU] Emitting actions (${actions.length})`);
    io.to(sessionId).emit(Events.AGENT_ACTIONS, { actions });
  } else {
    console.log("[NLU] No actions");
  }
  const prevState = conversationState[sessionId] || {};
  const {
    phase = "UNKNOWN",
    risk = 0,
    opportunity = 0,
    reason = "",
  } = conversation_state;
  const phaseChanged = prevState.phase !== phase;
  const riskChanged = Math.abs((prevState.risk || 0) - risk) >= 10;
  const oppChanged = Math.abs((prevState.opportunity || 0) - opportunity) >= 10;
  conversationState[sessionId] = { phase, risk, opportunity };
  if (phaseChanged || riskChanged || oppChanged) {
    console.log(
      `[NLU] Emitting conversation state update: phaseChanged=${phaseChanged}, riskChanged=${riskChanged}, oppChanged=${oppChanged}`,
    );
    logger.info(
      `[STATE] ${sessionId} → phase=${phase}, risk=${risk}, opportunity=${opportunity}`,
    );

    io.to(sessionId).emit(Events.CONVERSATION_STATE, {
      phase,
      risk,
      opportunity,
      reason,
      prevPhase: prevState.phase || null,
    });
  }
}

// New helper: run NLU on provided arbitrary transcript text (used by server-side buffering)
async function runNluWithText(io, sessionId, transcript) {
  if (!transcript || !transcript.trim()) return;
  console.log(`🔥 RUNNING LLM WITH:`, transcript);
  const prompt = buildMasterPrompt(transcript);
  const raw = await run(prompt);
  if (!raw) return;
  console.log("🔥 RAW GEMINI OUTPUT:\n", raw);

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/{[\s\S]*}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch (err) {
        logger.error("NLU JSON parse error after extraction:", err);
        return;
      }
    } else {
      logger.error("NLU JSON parse error, no JSON found");
      return;
    }
  }

  const {
    intent = {},
    suggestions = [],
    compliance = [],
    crm = {},
    actions = [],
    conversation_state = {},
  } = parsed;

  console.log(`[NLU] Emitting intent: ${JSON.stringify(intent)}`);
  io.to(sessionId).emit(Events.AGENT_INTENT, { intent });

  console.log(`[NLU] Emitting suggestions (${suggestions.length})`);
  io.to(sessionId).emit(Events.AGENT_SUGGESTIONS, { suggestions });

  if (compliance.length) {
    console.log(`[NLU] Emitting compliance (${compliance.length})`);
    io.to(sessionId).emit(Events.AGENT_COMPLIANCE, { flags: compliance });
  } else {
    console.log("[NLU] No compliance flags");
  }

  if (Object.keys(crm).length) {
    console.log(`[NLU] Emitting CRM fields (${Object.keys(crm).length})`);
    io.to(sessionId).emit(Events.AGENT_CRM, { fields: crm });
  } else {
    console.log("[NLU] No CRM fields");
  }

  if (actions.length) {
    console.log(`[NLU] Emitting actions (${actions.length})`);
    io.to(sessionId).emit(Events.AGENT_ACTIONS, { actions });
  } else {
    console.log("[NLU] No actions");
  }

  // Conversation state handling (same as runNlu)
  const prevState = conversationState[sessionId] || {};
  const {
    phase = "UNKNOWN",
    risk = 0,
    opportunity = 0,
    reason = "",
  } = conversation_state;

  const phaseChanged = prevState.phase !== phase;
  const riskChanged = Math.abs((prevState.risk || 0) - risk) >= 10;
  const oppChanged = Math.abs((prevState.opportunity || 0) - opportunity) >= 10;

  conversationState[sessionId] = { phase, risk, opportunity };

  if (phaseChanged || riskChanged || oppChanged) {
    console.log(
      `[NLU] Emitting conversation state update: phaseChanged=${phaseChanged}, riskChanged=${riskChanged}, oppChanged=${oppChanged}`,
    );
    logger.info(
      `[STATE] ${sessionId} → phase=${phase}, risk=${risk}, opportunity=${opportunity}`,
    );
    io.to(sessionId).emit(Events.CONVERSATION_STATE, {
      phase,
      risk,
      opportunity,
      reason,
      prevPhase: prevState.phase || null,
    });
  }
}

const pending = {};
function scheduleNluProcessing(io, sessionId, delay = 2000) {
  if (pending[sessionId]) {
    clearTimeout(pending[sessionId]);
    console.log(`[NLU] Debounce reset for ${sessionId}`);
  }
  pending[sessionId] = setTimeout(() => {
    console.log(`[NLU] Debounce fired for ${sessionId} after ${delay}ms`);
    runNlu(io, sessionId);
  }, delay);
}
module.exports = { scheduleNluProcessing, runNlu, runNluWithText }; // Exporting the scheduleNluProcessing and new helper
// processor.js - NLU processing module which uses conversationStore to manage transcripts and sessions

// processor.js - NLU processing module

// const { run } = require("./llmClient");
// const buildMasterPrompt = require("./prompts/masterPrompt");
// const conversationStore = require("../services/conversationStore");
// const Events = require("../sockets/events");
// const logger = require("../utils/logger");

// // ------------------------------
// // Conversation readiness gate
// // ------------------------------
// function isConversationReady(transcript) {
//   const words = transcript.trim().split(/\s+/);

//   // Too short
//   if (words.length < 25) return false;

//   // High repetition (mic checks, glitches)
//   const unique = new Set(words.map((w) => w.toLowerCase()));
//   if (unique.size / words.length < 0.4) return false;

//   // No sentence boundary yet
//   if (!/[?.!]/.test(transcript)) return false;

//   return true;
// }

// // ------------------------------
// // In-memory conversation state
// // ------------------------------
// const conversationState = {};

// // ------------------------------
// // Core NLU runner
// // ------------------------------
// async function runNlu(io, sessionId) {
//   const transcript = conversationStore.getTranscript(sessionId) || "";
//   if (!transcript.trim()) return;

//   console.log("Running NLU for session:", sessionId);

//   const prompt = buildMasterPrompt(transcript);
//   const raw = await run(prompt);
//   if (!raw) return;

//   let parsed;
//   try {
//     parsed = JSON.parse(raw);
//   } catch {
//     const match = raw.match(/{[\s\S]*}/);
//     if (!match) {
//       logger.error("NLU JSON parse error: no JSON found");
//       return;
//     }
//     try {
//       parsed = JSON.parse(match[0]);
//     } catch (err) {
//       logger.error("NLU JSON parse error after extraction:", err);
//       return;
//     }
//   }

//   const {
//     intent = {},
//     suggestions = [],
//     compliance = [],
//     crm = {},
//     actions = [],
//     conversation_state = {},
//   } = parsed;

//   // ------------------------------
//   // ALWAYS emit Agent Assist outputs
//   // ------------------------------
//   io.to(sessionId).emit(Events.AGENT_INTENT, { intent });
//   io.to(sessionId).emit(Events.AGENT_SUGGESTIONS, { suggestions });

//   if (compliance.length) {
//     io.to(sessionId).emit(Events.AGENT_COMPLIANCE, { flags: compliance });
//   }

//   if (Object.keys(crm).length) {
//     io.to(sessionId).emit(Events.AGENT_CRM, { fields: crm });
//   }

//   if (actions.length) {
//     io.to(sessionId).emit(Events.AGENT_ACTIONS, { actions });
//   }

//   // ------------------------------
//   // 🔥 Gate ONLY conversation_state
//   // ------------------------------
//   if (!isConversationReady(transcript)) {
//     console.log("[NLU] Conversation not ready — skipping conversation state");
//     return;
//   }

//   // ------------------------------
//   // Conversation State Machine
//   // ------------------------------
//   const prevState = conversationState[sessionId] || {};

//   const {
//     phase = "UNKNOWN",
//     risk = 0,
//     opportunity = 0,
//     reason = "",
//   } = conversation_state;

//   const phaseChanged = prevState.phase !== phase;
//   const riskChanged = Math.abs((prevState.risk || 0) - risk) >= 10;
//   const oppChanged =
//     Math.abs((prevState.opportunity || 0) - opportunity) >= 10;

//   conversationState[sessionId] = { phase, risk, opportunity };

//   if (phaseChanged || riskChanged || oppChanged) {
//     console.log(
//       `[NLU] Emitting conversation state update: phaseChanged=${phaseChanged}, riskChanged=${riskChanged}, oppChanged=${oppChanged}`
//     );

//     logger.info(
//       `[STATE] ${sessionId} → phase=${phase}, risk=${risk}, opportunity=${opportunity}`
//     );

//     io.to(sessionId).emit(Events.CONVERSATION_STATE, {
//       phase,
//       risk,
//       opportunity,
//       reason,
//       prevPhase: prevState.phase || null,
//     });
//   }
// }

// // ------------------------------
// // Debounce per session
// // ------------------------------
// const pending = {};

// function scheduleNluProcessing(io, sessionId, delay = 2000) {
//   if (pending[sessionId]) {
//     clearTimeout(pending[sessionId]);
//   }

//   pending[sessionId] = setTimeout(() => {
//     runNlu(io, sessionId);
//   }, delay);
// }

// module.exports = {
//   scheduleNluProcessing,
//   runNlu,
// };
