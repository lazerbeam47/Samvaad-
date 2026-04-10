const { GoogleGenerativeAI } = require("@google/generative-ai");
const logger = require("../utils/logger");

const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const genAI = new GoogleGenerativeAI(API_KEY);

async function run(prompt) {
  if (!API_KEY) return logger.error("Missing GOOGLE_API_KEY");

  try {
    const model = genAI.getGenerativeModel({ model: MODEL });

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "You are a strict JSON generator. Return ONLY valid JSON with keys: intent, suggestions, compliance, crm, actions.\n\n" +
                prompt,
            },
          ],
        },
      ],
    });

    return result.response.text();
  } catch (err) {
    logger.error("[Gemini Error]", err);
    return "";
  }
}

module.exports = { run };
