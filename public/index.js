const socket = io();
let mediaRecorder;
let audioCtx;

document.getElementById("startBtn").onclick = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      event.data.arrayBuffer().then(buffer => {
        socket.emit("audio-stream", buffer);
      });
    }
  };

  mediaRecorder.start(250);
  document.getElementById("status").innerText = "🎙️ Listening...";
};

document.getElementById("stopBtn").onclick = () => {
  if (mediaRecorder) {
    mediaRecorder.stop();
    document.getElementById("status").innerText = "⏹️ Stopped";
  }
};

socket.on("ai-audio", async (audioBuffer) => {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const buffer = await audioCtx.decodeAudioData(audioBuffer);
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(audioCtx.destination);
  source.start(0);
  document.getElementById("status").innerText = "🤖 AI Speaking...";
});
