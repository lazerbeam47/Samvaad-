const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
require("dotenv").config();

function createDeepgramStream(onTranscript, onError) {
  console.log("Initializing Deepgram…");

  if (!process.env.DEEPGRAM_API_KEY) {
    const err = new Error(
      "DEEPGRAM_API_KEY is not set in environment variables",
    );
    console.error("❌", err.message);
    if (onError) onError(err);
    return null;
  }

  const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

  const connection = deepgram.listen.live({
    model: "nova-3",
    language: "en-US",
    encoding: "linear16",
    sample_rate: 16000,
    channels: 1,
    smart_format: true,
    interim_results: true,
    vad_events: true,
    utterance_end_ms: 1800,
    punctuate: true,
  });

  let isOpen = false;

  // Set up ALL event handlers BEFORE the connection opens
  connection.on(LiveTranscriptionEvents.Open, () => {
    isOpen = true;
    console.log("🟢 Deepgram Live Stream Connected");
    console.log("🔍 Connection ready, methods available:", {
      send: typeof connection.send === "function",
      finish: typeof connection.finish === "function",
      getRawStream: typeof connection.getRawStream === "function",
    });
    try {
      onTranscript?.("__STT_READY__");
    } catch {}
  });

  connection.on(LiveTranscriptionEvents.Transcript, (data) => {
    try {
      console.log("📝 Transcript event received");

      // Handle different transcript structures
      let transcript = null;
      const isFinal = data?.is_final || false;

      // Try multiple paths to get transcript
      if (data?.channel?.alternatives?.[0]?.transcript) {
        transcript = data.channel.alternatives[0].transcript;
      } else if (data?.alternatives?.[0]?.transcript) {
        transcript = data.alternatives[0].transcript;
      } else if (data?.transcript) {
        transcript = data.transcript;
      } else if (typeof data === "string") {
        transcript = data;
      }

      // Log the full data structure for debugging (first time only)
      if (!connection._loggedStructure) {
        console.log(
          "🔍 Full transcript data structure:",
          JSON.stringify(data, null, 2),
        );
        connection._loggedStructure = true;
      }

      if (transcript && transcript.trim()) {
        console.log(
          `✅ Transcript (${isFinal ? "FINAL" : "INTERIM"}):`,
          transcript,
        );
        // Pass both text and finality so callers can act accordingly
        onTranscript({ text: transcript, isFinal });
      } else {
        // Even if empty, log it for debugging
        console.log(`⚠️ Empty transcript (${isFinal ? "FINAL" : "INTERIM"})`);
      }
    } catch (err) {
      console.error("❌ Error processing transcript:", err);
      console.error("Error stack:", err.stack);
      if (onError) onError(err);
    }
  });

  connection.on(LiveTranscriptionEvents.Error, (error) => {
    console.error("🔴 Deepgram Error:", error);
    if (onError) {
      onError(error);
    }
  });

  connection.on(LiveTranscriptionEvents.Close, () => {
    isOpen = false;
    console.log("🔴 Deepgram Stream Closed");
  });

  connection.on(LiveTranscriptionEvents.Metadata, (data) => {
    console.log("📊 Deepgram Metadata:", data);
  });

  // Add method to check if connection is ready
  connection.isReady = () => isOpen;

  // Add send wrapper that handles both methods
  const originalSend = connection.send;
  connection.sendAudio = function (buffer) {
    if (!isOpen) {
      console.warn("⚠️ Attempting to send audio before connection is open");
      return false;
    }

    if (!buffer || buffer.length === 0) {
      console.warn("⚠️ Attempting to send empty buffer");
      return false;
    }

    try {
      if (typeof originalSend === "function") {
        originalSend.call(this, buffer);
        return true;
      } else if (typeof this.getRawStream === "function") {
        const rawStream = this.getRawStream();
        if (rawStream && typeof rawStream.send === "function") {
          rawStream.send(buffer);
          return true;
        }
      }
      console.error("❌ No send method available");
      return false;
    } catch (err) {
      console.error("❌ Error sending audio:", err);
      return false;
    }
  };

  console.log("🔍 Deepgram connection created");

  return connection;
}

module.exports = createDeepgramStream;
