const fs = require('fs');
const { OpenAI } = require('openai');
require('dotenv').config({ path: '.env.local' });

const apiKey = process.env.MESH_API_KEY;
if (!apiKey) {
  console.error("Please set MESH_API_KEY in .env.local to run this test.");
  process.exit(1);
}

const client = new OpenAI({
  baseURL: 'https://api.meshapi.ai/v1',
  apiKey: apiKey,
});

async function run() {
  console.log("=== Phase 2: Mesh API Audio Smoke Test ===\n");
  
  const filePath = './test.webm';
  if (!fs.existsSync(filePath)) {
    console.error(`Error: test file not found at ${filePath}.`);
    console.log("Please create a short audio file (e.g., using MediaRecorder in the browser) and save it as 'test.webm' in the project root to test.");
    process.exit(1);
  }

  console.log(`-> Sending ${filePath} to Transcribe...`);
  try {
    const transcription = await client.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: 'whisper-1',
    });

    console.log("\nSuccess! Raw Transcription output:\n");
    console.log(transcription.text);
  } catch (e) {
    console.error("Transcription failed:", e.message);
  }
}

run().catch(console.error);
