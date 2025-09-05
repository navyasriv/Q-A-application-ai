const express = require("express");
const https = require("https");
const { Server } = require("socket.io");
const WebSocket = require("ws");
const path = require("path");
const fs = require("fs");
let fetchFn = global.fetch;
if (!fetchFn) {
  fetchFn = require("node-fetch");
}
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const server = https.createServer(app);
const io = new Server(server);


const options = {
  key: fs.readFileSync(__dirname + "/certs/key.pem"),
  cert: fs.readFileSync(__dirname + "/certs/cert.pem")
};




// 🔑 Replace with your keys
const DEEPGRAM_API_KEY = "07660855da74bd89e9c2bdfb53b1c35c454d2363";
const GEMINI_API_KEY = "AIzaSyB3WPBBmIjZuoPnU8inHcIkjfExVAZ6U2Y";

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));

// Gemini Setup
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function getAIResponse(userQuestion) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `You are a helpful human assistant having a casual conversation.
            Answer the following question in clear, natural, human-like language —
            as if you were chatting with a friend, not giving a technical or robotic response.
            Do not mention that you are an AI.
            You are a helpful assistant. Always give clear, natural, and human-like answers.
            If your response contains any text inside quotation marks (single ' ' or double " " or * or #), remove the marks and the text inside them completely. Do not mention that you removed anything. Just return the cleaned, conversational answer.

            User's question: ${userQuestion}`
          }
        ]
      }
    ]
  });

  return result.response.text();
}


// Deepgram TTS
async function textToSpeech(text) {
  const res = await fetchFn("https://api.deepgram.com/v1/speak?model=aura-asteria-en", {
    method: "POST",
    headers: {
      Authorization: `Token ${DEEPGRAM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  return await res.arrayBuffer();
}

// Handle socket.io
io.on("connection", (socket) => {
  console.log("✅ User connected");

  const dgWs = new WebSocket("wss://api.deepgram.com/v1/listen", {
    headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` },
  });

  socket.on("audio-stream", (data) => {
    dgWs.send(data);
  });

  socket.on("text-question", async (text) => {
    console.log("✍️ User (typed):", text);
  
    // 1. Get AI response from Gemini
    const aiResponse = await getAIResponse(text);
    console.log("🤖 AI:", aiResponse);
  
    // 2. Convert response to speech
    const audioStream = await textToSpeech(aiResponse);
  
    // 3. Send audio back to browser
    socket.emit("ai-audio", audioStream, aiResponse);
  });

  // dgWs.on("message", async (msg) => {
  //   const transcript = JSON.parse(msg.toString());
  //   if (transcript.channel?.alternatives[0]?.transcript) {
  //     const userText = transcript.channel.alternatives[0].transcript;
  //     console.log("🎤 User:", userText);

  //     const aiResponse = await getAIResponse(userText);
  //     console.log("🤖 AI:", aiResponse);

  //     const audioStream = await textToSpeech(aiResponse);
  //     socket.emit("ai-audio", audioStream);
  //   }
  // });
});

https.createServer(options, app).listen(8080, '192.168.2.10',() => {
  console.log("Server running on https://192.168.2.10:8080");
});
