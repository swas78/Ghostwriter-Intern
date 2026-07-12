import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'https://api.meshapi.ai/v1',
  apiKey: process.env.MESH_API_KEY || 'dummy_key',
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as Blob;
    
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Convert the Blob to an ArrayBuffer, then to a Buffer
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    
    // Create a native File object (available in Node >= 20, which Next.js App Router uses)
    const audioFile = new File([fileBuffer], 'audio.webm', { type: file.type || 'audio/webm' });

    const response = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
    });

    return NextResponse.json({ text: response.text });
  } catch (error: any) {
    console.error("Transcription error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
