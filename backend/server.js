require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const createDeepgramStream = require("./stt/liveDeepgram");
const conversationStore = require("./services/conversationStore");
const { scheduleNluProcessing, runNluWithText } = require("./nlu/processor");

// 🔥 NEW: conversation state lifecycle helpers
const {
  initConversationState,
  clearConversationState,
} = require("./services/conversationState");

const app = express();
app.use(cors());

app.get("/", (req, res) => res.send("Deepgram server running"));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "http://localhost:5173", methods: ["GET", "POST"] },
});

const sessionStreams = {};
const audioBuffers = {};

// New: per-session transcript buffering for controlled LLM runs
const transcriptBuffers = {};
const transcriptLastRun = {}; // timestamp in ms

// Global hard rate limiter to protect Gemini quota
const lastGlobalCall = { time: 0 };
function canCallLLM() {
  const now = Date.now();
  if (now - lastGlobalCall.time < 5000) return false;
  lastGlobalCall.time = now;
  return true;
}

async function handleTranscript(sessionId, text) {
  transcriptBuffers[sessionId] ||= [];
  transcriptBuffers[sessionId].push(text);

  const now = Date.now();
  const lastRun = transcriptLastRun[sessionId] || 0;

  // Run LLM at most every 3s when there is enough content
  if (now - lastRun > 3000) {
    const combined = transcriptBuffers[sessionId].join(" ").trim();

    // DEBUG
    console.log("🧠 BUFFER:", combined);
    console.log("🧠 WORD COUNT:", combined.split(/\s+/).length);
    console.log("⏱️ LAST RUN:", now - lastRun);

    // Only run LLM when we have at least ~4 words
    if (combined.split(/\s+/).length > 4) {
      // Check global rate limiter before calling LLM
      if (!canCallLLM()) {
        console.log("⚠️ Skipping LLM run due to global rate limit");
        return; // keep buffer for next opportunity
      }

      console.log("🔥 RUNNING LLM WITH:", combined);
      try {
        await runNluWithText(io, sessionId, combined);
      } catch (err) {
        console.error("❌ Error running LLM:", err);
      }

      // Keep last two segments to preserve context for the next run
      transcriptBuffers[sessionId] = transcriptBuffers[sessionId].slice(-2);
      transcriptLastRun[sessionId] = now;
    }
  }
}

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("join", ({ sessionId }) => {
    console.log("Joined session:", sessionId);
    socket.join(sessionId);

    // 🔥 NEW: initialize conversation state
    initConversationState(sessionId);

    if (!sessionStreams[sessionId]) {
      const stream = createDeepgramStream(
        (payload) => {
          // Keep backwards compatibility with the ready sentinel
          if (payload === "__STT_READY__") {
            io.to(sessionId).emit("stt-ready");

            const buffer = audioBuffers[sessionId] || [];
            let sentCount = 0;

            for (const chunk of buffer) {
              if (stream.sendAudio?.(chunk)) sentCount++;
              else if (typeof stream.send === "function") {
                stream.send(chunk);
                sentCount++;
              }
            }

            if (buffer.length) {
              console.log(
                `✅ Flushed ${sentCount}/${buffer.length} buffered chunks`,
              );
            }

            audioBuffers[sessionId] = [];
            return;
          }

          // Accept either the old string payload or the new object { text, isFinal }
          let text = null;
          let isFinal = false;

          if (typeof payload === "string") {
            text = payload;
          } else if (payload && typeof payload === "object") {
            text = payload.text || null;
            isFinal = !!payload.isFinal;
          }

          if (!text || !text.trim()) {
            return;
          }

          console.log("✅ Transcript received:", text, "isFinal:", isFinal);

          // Forward both text and isFinal to the connected clients
          io.to(sessionId).emit("interim-transcript", { text, isFinal });

          conversationStore.append(sessionId, text);

          // Force trigger on long final sentence (immediate) — keeps LLM responsive for long utterances
          if (isFinal && text.split(/\s+/).length > 6) {
            const isImportant = text.split(/\s+/).length > 6;

            if (!canCallLLM() && !isImportant) {
              console.log("⚠️ Skipping LLM due to rate limit");
              return;
            }

            console.log("🧠 FORCED RUN WITH FINAL SENTENCE:", text);
            runNluWithText(io, sessionId, text).catch((err) =>
              console.error("❌ Error running forced LLM:", err),
            );
          }

          // Only trigger NLU on final transcripts to avoid burning LLM quota
          if (isFinal) {
            handleTranscript(sessionId, text);
          }
        },
        (err) => console.error("❌ Deepgram Error:", err),
      );

      if (!stream) {
        console.error("❌ Failed to create Deepgram stream");
        return;
      }

      sessionStreams[sessionId] = stream;
      if (!audioBuffers[sessionId]) {
        audioBuffers[sessionId] = [];
      }

      console.log(
        "📦 Stream created, buffered chunks:",
        audioBuffers[sessionId].length,
      );

      const checkInterval = setInterval(() => {
        if (stream.isReady && stream.isReady()) {
          console.log(
            "🟢 Connection ready, flushing",
            audioBuffers[sessionId]?.length || 0,
            "buffered audio chunks...",
          );

          const buffer = audioBuffers[sessionId];
          if (buffer && buffer.length > 0) {
            let sentCount = 0;

            buffer.forEach((chunk, index) => {
              try {
                if (stream.sendAudio) {
                  if (stream.sendAudio(chunk)) sentCount++;
                } else if (typeof stream.send === "function") {
                  stream.send(chunk);
                  sentCount++;
                }
              } catch (err) {
                console.error("Error sending buffered chunk", index, ":", err);
              }
            });

            console.log(
              "✅ Flushed",
              sentCount,
              "of",
              buffer.length,
              "buffered chunks",
            );
            audioBuffers[sessionId] = [];
          }

          clearInterval(checkInterval);
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        if (audioBuffers[sessionId]?.length > 0) {
          console.log(
            "⚠️ Still have",
            audioBuffers[sessionId].length,
            "buffered chunks after 10s",
          );
        }
      }, 10000);
    }
  });

  socket.on("audio-chunk", (audioBuffer, meta) => {
    const { sessionId, seq, sampleRate } = meta || {};

    if (!sessionId) {
      console.error("❌ No sessionId provided in audio-chunk");
      return;
    }

    const buf = Buffer.from(audioBuffer);
    console.log(
      "📤 Received audio chunk for session:",
      sessionId,
      "size:",
      buf.length,
      "bytes",
      "seq:",
      seq,
      "rate:",
      sampleRate,
    );

    const stream = sessionStreams[sessionId];

    if (!stream) {
      console.log(
        "⏳ Stream not ready yet, buffering chunk for session:",
        sessionId,
      );
      audioBuffers[sessionId] ||= [];
      audioBuffers[sessionId].push(buf);
      return;
    }

    if (stream.isReady && stream.isReady()) {
      try {
        if (stream.sendAudio) {
          const success = stream.sendAudio(buf);
          if (!success) console.error("❌ Failed to send audio to Deepgram");
        } else if (typeof stream.send === "function") {
          stream.send(buf);
        } else {
          audioBuffers[sessionId] ||= [];
          audioBuffers[sessionId].push(buf);
        }
      } catch (err) {
        console.error("❌ Deepgram send error:", err);
      }
    } else {
      audioBuffers[sessionId] ||= [];
      audioBuffers[sessionId].push(buf);
    }
  });

  socket.on("end-call", ({ sessionId }) => {
    console.log("🛑 End call requested for session:", sessionId);

    const stream = sessionStreams[sessionId];
    if (stream) {
      try {
        if (typeof stream.finish === "function") {
          stream.finish();
        } else if (typeof stream.close === "function") {
          stream.close();
        }
      } catch (err) {
        console.error("❌ Error finishing stream:", err);
      }
      delete sessionStreams[sessionId];
    }

    delete audioBuffers[sessionId];

    // 🔥 NEW: clear conversation state
    clearConversationState(sessionId);

    io.to(sessionId).emit("call-ended");
  });
});

server.listen(3000, () =>
  console.log("🚀 Samvaad Backend running on port 3000"),
);
