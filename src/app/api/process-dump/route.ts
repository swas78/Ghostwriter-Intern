import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { parseJson } from '@/utils/parseJson';

const openai = new OpenAI({
  baseURL: 'https://api.meshapi.ai/v1',
  apiKey: process.env.MESH_API_KEY || 'dummy_key',
});

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export async function POST(req: NextRequest) {
  const { text } = await req.json();

  if (!text) {
    return new Response('Missing text', { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const sendEvent = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // 1. EXTRACT
        const extractRes = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are an extraction assistant. Extract actionable communication tasks from the user's messy brain dump.
Return a JSON array of objects. Each object must have:
- id: a unique string ID
- recipient: string (name or descriptor)
- intent: string (raw intent of the message)
- relationship_context: string (inferred formality/relationship)
- is_actionable: boolean (true if it's a communication task that requires drafting, false if it's just a reminder/venting)

Example output:
[
  { "id": "1", "recipient": "Priya", "intent": "reply about invoice", "relationship_context": "professional, familiar", "is_actionable": true },
  { "id": "2", "recipient": "Self", "intent": "buy milk", "relationship_context": "none", "is_actionable": false }
]
Output ONLY raw JSON.`
            },
            { role: 'user', content: text }
          ],
          temperature: 0.1
        });

        let extractedItems = [];
        try {
          extractedItems = parseJson<any[]>(extractRes.choices[0].message.content || '[]');
        } catch (e) {
          console.error("Extraction JSON parsing failed", e);
          extractedItems = [];
        }

        let actionableItems = extractedItems.filter(item => item.is_actionable);
        
        let overflow = 0;
        if (actionableItems.length > 8) {
          overflow = actionableItems.length - 8;
          actionableItems = actionableItems.slice(0, 8);
        }

        if (actionableItems.length === 0) {
          sendEvent('extracted', { items: [], overflow });
          controller.close();
          return;
        }

        // 2. RANK
        const rankRes = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are an urgency ranking assistant. Given a JSON array of communication tasks, assign an urgency score from 1 (low) to 5 (high) to each.
Return a JSON object mapping the task ID to its integer score. Output ONLY raw JSON.`
            },
            { role: 'user', content: JSON.stringify(actionableItems) }
          ],
          temperature: 0.1
        });

        let rankings: Record<string, number> = {};
        try {
          rankings = parseJson<Record<string, number>>(rankRes.choices[0].message.content || '{}');
        } catch (e) {
          console.error("Rank JSON parsing failed", e);
        }

        actionableItems.forEach(item => {
          item.urgency = rankings[item.id] || 3;
        });

        actionableItems.sort((a, b) => b.urgency - a.urgency);

        // Send extracted + ranked items to UI immediately
        sendEvent('extracted', { items: actionableItems, overflow });

        // 3. DRAFT (in parallel)
        const draftPromises = actionableItems.map(async (task) => {
          let retryCount = 0;
          let success = false;
          
          while (!success && retryCount < 2) {
            try {
              const draftRes = await openai.chat.completions.create({
                model: 'claude-3-5-sonnet-20240620',
                messages: [
                  {
                    role: 'system',
                    content: `You are an expert ghostwriter. Draft a message based on the user's intent. 
Write ONLY the message body, no subject line, no pleasantries around the output. 
Match the tone to the relationship_context.
Also provide a tone_label and a confidence level (high or low).
Output a JSON object: { "message": "...", "tone_label": "...", "confidence": "high|low" }`
                  },
                  {
                    role: 'user',
                    content: `Recipient: ${task.recipient}\nIntent: ${task.intent}\nRelationship: ${task.relationship_context}`
                  }
                ],
                temperature: 0.7
              }, { signal: timeoutSignal(20000) }); // 20s timeout

              let draftData;
              try {
                draftData = parseJson<any>(draftRes.choices[0].message.content || '{}');
                sendEvent('drafted', {
                  id: task.id,
                  draft: draftData.message,
                  toneLabel: draftData.tone_label,
                  confidence: draftData.confidence
                });
                success = true;
              } catch (e) {
                console.error("Draft JSON parsing failed for task", task.id, e);
                retryCount++;
              }
            } catch (error) {
              console.error("Draft call failed or timed out for task", task.id, error);
              retryCount++;
            }
          }
          
          if (!success) {
            sendEvent('draft_error', { id: task.id, error: 'Draft timed out or JSON parsing failed twice' });
          }
        });

        await Promise.allSettled(draftPromises);
        controller.close();
      } catch (err: any) {
        sendEvent('error', { message: err.message });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
