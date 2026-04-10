// Conversation Store Service which could be used to store and retrieve conversations

const sessions = {}; // In-memory store for conversations, keyed by sessionId

function initSession(sessionId) {
  // Initialize a session if it doesn't exist
  if (!sessions[sessionId]) {
    sessions[sessionId] = {
      transcript: "",
      lastUpdated: Date.now(),
    };
  }
}

function append(sessionId, text) {
  // Append text to a session's transcript
  if (!sessions[sessionId]) initSession(sessionId);
  const chunk = (text ?? "").toString().trim();
  if (!chunk) return; // ignore empty/whitespace

  const current = sessions[sessionId].transcript;
  sessions[sessionId].transcript = current ? `${current} ${chunk}` : chunk;
  sessions[sessionId].lastUpdated = Date.now();
  // keep only last 4000 chars for performance
  if (sessions[sessionId].transcript.length > 4000) {
    sessions[sessionId].transcript =
      sessions[sessionId].transcript.slice(-4000);
  }
}

function getTranscript(sessionId) {
  // Retrieve the transcript for a session
  return sessions[sessionId]?.transcript || "";
}

function endSession(sessionId) {
  // Clean up session data
  delete sessions[sessionId];
}

module.exports = {
  initSession,
  append,
  getTranscript,
  endSession,
};
