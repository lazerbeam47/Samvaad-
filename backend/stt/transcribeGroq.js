require("dotenv").config();
const Groq = require("groq-sdk");
const fs = require("fs");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function transcribeGroq(filePath) {
  try {
    const audioBuffer = fs.readFileSync(filePath); // <--- IMPORTANT
    const response = await groq.audio.transcriptions.create({
      file: {
        name: "chunk.webm",
        type: "audio/webm",
        data: audioBuffer,         // <-- RAW BUFFER, supported
      },
      model: "whisper-large-v3",
    });

    return response.text;
  } catch (err) {
    console.error("Groq STT Error:", err);
    throw err;
  }
}

module.exports = transcribeGroq;
