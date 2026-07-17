import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const groqClient = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || 'dummy_key',
  baseURL: 'https://api.groq.com/openai/v1',
});

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  try {
    const isMockMode = process.env.USE_MOCK_API === 'true';

    if (isMockMode) {
      await sleep(1500);
      return NextResponse.json({ text: "remind me to buy milk, text Sarah about dinner, and call the plumber" });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Convert WebM/Opus File object into a buffer or stream that OpenAI SDK can accept
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // We need to pass a File-like object to the SDK
    const audioFile = new File([buffer], file.name || 'audio.webm', { type: file.type || 'audio/webm' });

    const response = await groqClient.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-large-v3',
    });

    return NextResponse.json({ text: response.text });
  } catch (error: any) {
    console.error('Transcription error:', error);
    return NextResponse.json({ error: error.message || 'Transcription failed' }, { status: 500 });
  }
}
