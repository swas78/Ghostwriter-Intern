let mediaRecorder;
let audioChunks = [];
let audioContext;
let analyser;
let stream;
let animationFrameId;
let silentStart = null;

const API_BASE = 'https://ghostwriter-intern-production.up.railway.app';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'start_recording') {
    startRecording();
  } else if (message.type === 'stop_recording') {
    stopRecording();
  }
});

async function startRecording() {
  console.log("startRecording called");
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("getUserMedia success");
    
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    silentStart = null;

    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (audioContext) audioContext.close();
      stream.getTracks().forEach(track => track.stop());

      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      await processAudio(audioBlob);
    };

    mediaRecorder.start();
    updateVolume();
  } catch (e) {
    console.error("Recording error:", e);
    let errorMsg = "Microphone error";
    if (e.name === 'NotAllowedError') errorMsg = "Microphone access denied";
    chrome.runtime.sendMessage({ type: 'ui_state', state: 'error', error: errorMsg });
  }
}

function updateVolume() {
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);

  // Derive 4 bars of volume
  const step = Math.floor(dataArray.length / 4);
  const bars = [0, 0, 0, 0];
  let totalVolume = 0;

  for (let i = 0; i < 4; i++) {
    let sum = 0;
    for (let j = 0; j < step; j++) {
      sum += dataArray[i * step + j];
    }
    const avg = sum / step;
    bars[i] = avg;
    totalVolume += avg;
  }

  // Check for silence
  if (totalVolume < 5) {
    if (!silentStart) silentStart = Date.now();
    else if (Date.now() - silentStart > 2000) {
      chrome.runtime.sendMessage({ type: 'no_audio_warning' });
    }
  } else {
    silentStart = null;
  }

  chrome.runtime.sendMessage({ type: 'volume_update', bars });

  animationFrameId = requestAnimationFrame(updateVolume);
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
}

async function processAudio(audioBlob) {
  try {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    
    // Transcribe
    const transcribeRes = await fetch(`${API_BASE}/api/transcribe`, {
      method: 'POST',
      body: formData,
    });
    
    if (!transcribeRes.ok) throw new Error(`Transcription failed: ${transcribeRes.status}`);
    
    const { text } = await transcribeRes.json();
    
    if (!text || !text.trim()) {
      throw new Error("No speech recognized");
    }

    // Process Dump
    const dumpRes = await fetch(`${API_BASE}/api/process-dump`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!dumpRes.ok) throw new Error(`Process Dump failed: ${dumpRes.status}`);

    chrome.runtime.sendMessage({ type: 'ui_state', state: 'done' });
    chrome.runtime.sendMessage({ type: 'open_popup' });
    
  } catch (e) {
    console.error("Pipeline error:", e);
    chrome.runtime.sendMessage({ type: 'ui_state', state: 'error', error: e.message });
  }
}
