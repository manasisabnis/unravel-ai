import express from "express";
import bodyParser from "body-parser";
import cors from "cors"; // ✅ import cors
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { VertexAI } from "@google-cloud/vertexai";

const app = express();
app.use(bodyParser.json());
app.use(cors()); // ✅ enable CORS for all routes

// Initialize VertexAI + TTS
const vertexAI = new VertexAI({ project: "unravel-ai-hackathon", location: "asia-south1" });
const generativeModel = vertexAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const ttsClient = new TextToSpeechClient();

// 🔹 Helper to split text into safe chunks
function chunkText(text, size = 4500) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

// 🔹 Endpoint: Explain document + optional audio
app.post("/explain", async (req, res) => {
  try {
    const { document, language } = req.body;

    if (!document) return res.status(400).json({ error: "Document is required." });

    // 1️⃣ Generate summary from Gemini
    const result = await generativeModel.generateContent({
      contents: [{ role: "user", parts: [{ text: `Summarize: ${document}` }] }],
    });

    const summaryText = result.response.candidates[0].content.parts[0].text;

    // 2️⃣ Check if audio is requested
    const audioRequested = req.query.audio === "true";
    if (!audioRequested) {
      return res.json({ summary: summaryText });
    }

    // 3️⃣ Split summary into chunks
    const chunks = chunkText(summaryText);

    let audioBuffers = [];
    for (const [i, part] of chunks.entries()) {
      try {
        const [response] = await ttsClient.synthesizeSpeech({
          input: { text: part },
          voice: { languageCode: language || "en-US", ssmlGender: "FEMALE" },
          audioConfig: { audioEncoding: "MP3" },
        });

        if (!response.audioContent) {
          console.warn(`⚠️ TTS returned empty for chunk ${i}`);
          continue;
        }

        audioBuffers.push(response.audioContent);
      } catch (ttsErr) {
        console.error(`❌ TTS error on chunk ${i}:`, ttsErr);
      }
    }

    // 4️⃣ If audio failed entirely, return summary only
    if (audioBuffers.length === 0) {
      console.warn("⚠️ No audio generated, returning summary only.");
      return res.json({ summary: summaryText });
    }

    const finalAudio = Buffer.concat(audioBuffers);

    res.json({
      summary: summaryText,
      audio: finalAudio.toString("base64"),
    });

  } catch (err) {
    console.error("❌ Error in /explain:", err);
    res.status(500).json({ error: "Failed to generate summary/audio." });
  }
});

// 🔹 Endpoint: Summary only
app.post("/generate", async (req, res) => {
  try {
    const { document } = req.body;
    if (!document) return res.status(400).json({ error: "Document is required." });

    const result = await generativeModel.generateContent({
      contents: [{ role: "user", parts: [{ text: `Summarize: ${document}` }] }],
    });

    const summaryText = result.response.candidates[0].content.parts[0].text;
    res.json({ summary: summaryText });
  } catch (err) {
    console.error("❌ Error in /generate:", err);
    res.status(500).json({ error: "Failed to generate summary." });
  }
});

// 🔹 Endpoint: Chat Q&A
app.post("/chat", async (req, res) => {
  try {
    const { document, question } = req.body;
    if (!document || !question) return res.status(400).json({ error: "Document and question are required." });

    const result = await generativeModel.generateContent({
      contents: [
        { role: "user", parts: [{ text: `Document: ${document}\nAnswer the question: ${question}` }] }
      ],
    });

    const answer = result.response.candidates[0].content.parts[0].text;
    res.json({ response: answer });
  } catch (err) {
    console.error("❌ Error in /chat:", err);
    res.status(500).json({ error: "Failed to answer question." });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
