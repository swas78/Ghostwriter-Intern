const fs = require('fs');
const https = require('https');
const path = require('path');

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function runTest(name, inputText, forceError = false) {
  console.log(`\n============================`);
  console.log(`TEST: ${name}`);
  console.log(`INPUT: "${inputText}"`);
  console.log(`============================\n`);

  try {
    const res = await fetch('http://localhost:3000/api/process-dump', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: inputText, simulateError: forceError })
    });

    if (!res.body) throw new Error("No response body");
    
    const decoder = new TextDecoder();
    const reader = res.body.getReader();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          if (dataStr) {
            const data = JSON.parse(dataStr);
            console.log(JSON.stringify(data, null, 2));
          }
        }
      }
    }
  } catch (e) {
    console.error("Test failed", e);
  }
}

async function runVoiceTest() {
  console.log(`\n============================`);
  console.log(`TEST: Voice Transcription`);
  console.log(`============================\n`);
  
  const audioFile = path.join(__dirname, 'test.mp3');
  
  // Download a real sample audio file
  await downloadFile('https://dl.espressif.com/dl/audio/ff-16b-2c-44100hz.mp3', audioFile);
  
  const fileBuffer = fs.readFileSync(audioFile);
  const blob = new Blob([fileBuffer], { type: 'audio/mpeg' });
  const formData = new FormData();
  formData.append('file', blob, 'audio.mp3');

  try {
    const res = await fetch('http://localhost:3000/api/transcribe', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Voice test failed", e);
  } finally {
    if (fs.existsSync(audioFile)) fs.unlinkSync(audioFile);
  }
}

async function runAll() {
  // 1. Noise test
  await runTest("Noise Test", "remind me to buy milk, text Sarah about dinner, and call the plumber");
  
  // 2. Tone test
  await runTest("Tone Test", "email John the CEO: I will submit the Q3 report by Friday. And text my brother Mike: I will submit the Q3 report by Friday.");
  
  // 3. Voice Transcription Test
  await runVoiceTest();

  // 4. Force Error Test
  await runTest("Force Error Test", "email David about the new design", true);

  // 5. Overflow test (10 tasks)
  const overflowText = Array.from({length: 12}, (_, i) => `email person${i} about task${i}`).join('. ');
  await runTest("Overflow Test", overflowText);
}

runAll();
