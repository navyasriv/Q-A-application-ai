const express = require("express");
const https = require("https");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
let fetchFn = global.fetch;
if (!fetchFn) {
  fetchFn = require("node-fetch");
}
const { GoogleGenerativeAI } = require("@google/generative-ai");

// SSL certs
const options = {
  key: fs.readFileSync(__dirname + "/certs/key.pem"),
  cert: fs.readFileSync(__dirname + "/certs/cert.pem"),
};

const app = express();
const server = https.createServer(options, app);

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));

// 🔑 API Keys
const DEEPGRAM_API_KEY = "07660855da74bd89e9c2bdfb53b1c35c454d2363";
const GEMINI_API_KEY = "AIzaSyB3WPBBmIjZuoPnU8inHcIkjfExVAZ6U2Y";

// Gemini Setup
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Gemini wrapper
async function getAIResponse(userQuestion) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `You are a friendly assistant. Answer clearly and conversationally. 
                   Do not mention being AI. Remove any text inside quotes. 
                   Question: ${userQuestion}`,
          },
        ],
      },
    ],
  });
  return result.response.text();
}

// Deepgram TTS wrapper
async function textToSpeech(text) {
  const res = await fetchFn("https://api.deepgram.com/v1/speak?model=aura-asteria-en", {
    method: "POST",
    headers: {
      Authorization: `Token ${DEEPGRAM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  return Buffer.from(await res.arrayBuffer());
}

const upload = multer();

// 🎤 Push-to-talk endpoint
app.post("/ask", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).send("No audio received.");
    }

    // 1. Send to Deepgram STT
    const dgResp = await fetchFn("https://api.deepgram.com/v1/listen", {
      method: "POST",
      headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
        "Content-Type": "audio/webm"  // your frontend records webm
      },
      body: req.file.buffer,
    });

    const dgData = await dgResp.json();
    console.log("🔎 Deepgram raw response:", JSON.stringify(dgData, null, 2));

    const userText = dgData.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
    if (!userText) {
      console.error("❌ No transcript found in Deepgram response");
      return res.status(400).send("Could not transcribe audio.");
    }

    console.log("🎤 User:", userText);

    // 2. AI (Gemini)
    const aiResponse = await getAIResponse(userText);
    console.log("🤖 AI:", aiResponse);

    // 3. TTS (Deepgram)
    const audioStream = await textToSpeech(aiResponse);

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": audioStream.length,
    });
    res.send(audioStream);

  } catch (err) {
    console.error("❌ /ask error:", err);
    res.status(500).send("Something went wrong.");
  }
});

server.listen(8080, "192.168.2.10", () => {
  console.log("✅ Server running on https://192.168.2.10:8080");
});
