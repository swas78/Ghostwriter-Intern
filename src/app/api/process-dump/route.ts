import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { parseJson } from '@/utils/parseJson';

const groqClient = new OpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY || 'dummy_groq_key',
});

const geminiClient = new OpenAI({
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  apiKey: process.env.GEMINI_API_KEY || 'dummy_gemini_key',
});

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  const { text, simulateError } = await req.json();

  if (!text) {
    return new Response('Missing text', { status: 400 });
  }

  const isMockMode = process.env.USE_MOCK_API === 'true';
  const forceError = (text.includes('force_error') || simulateError) && process.env.NODE_ENV !== 'production';

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const sendEvent = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        let actionableItems: any[] = [];
        let overflow = 0;

        if (isMockMode && !process.env.SIMULATE_PARSE_FAILURE) {
          // Simulate latency
          await sleep(1000);
          
          if (text.includes("milk, text Sarah")) {
            actionableItems = [
              { id: '1', recipient: 'Sarah', intent: 'dinner', relationship_context: 'friend, casual', is_actionable: true, urgency: 5 },
              { id: '2', recipient: 'plumber', intent: 'call them', relationship_context: 'professional, direct', is_actionable: true, urgency: 4 }
            ];
          } else if (text.includes("CEO")) {
            actionableItems = [
              { id: '1', recipient: 'John the CEO', intent: 'submit Q3 report by Friday', relationship_context: 'highly professional, formal', is_actionable: true, urgency: 5 },
              { id: '2', recipient: 'brother Mike', intent: 'submit Q3 report by Friday', relationship_context: 'informal, family', is_actionable: true, urgency: 2 }
            ];
          } else if (text.includes("person10")) {
            // Overflow test
            for (let i = 0; i < 12; i++) {
              actionableItems.push({ id: `${i}`, recipient: `Person ${i}`, intent: 'task', relationship_context: 'casual', is_actionable: true, urgency: 3 });
            }
          } else {
            actionableItems = [
              { id: '1', recipient: 'Unknown', intent: 'process dump', relationship_context: 'neutral', is_actionable: true, urgency: 3 }
            ];
          }

          if (actionableItems.length > 8) {
            overflow = actionableItems.length - 8;
            actionableItems = actionableItems.slice(0, 8);
          }
          
          sendEvent('extracted', { items: actionableItems, overflow });
          
          const draftPromises = actionableItems.map(async (task) => {
            await sleep(1500 + Math.random() * 1000);
            if (forceError && task.id === '1') {
              sendEvent('draft_error', { id: task.id, error: 'Draft timed out or JSON parsing failed twice' });
              return;
            }
            sendEvent('drafted', {
              id: task.id,
              draft: `[MOCK DRAFT] Hey ${task.recipient}, just following up on: ${task.intent}.`,
              toneLabel: task.relationship_context.split(',')[0],
              confidence: 'high'
            });
          });
          
          await Promise.allSettled(draftPromises);
          controller.close();
          return;
        }

        // --- REAL API EXECUTION BELOW ---
        // 1. EXTRACT via Groq
        const extractRes = await groqClient.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: `You are an extraction assistant. Extract actionable communication tasks from the user's messy brain dump.
Return ONLY a JSON array of objects. Each object must have:
- id: a unique string ID
- recipient: string (name or descriptor)
- intent: string (raw intent of the message)
- relationship_context: string (inferred formality/relationship)
- is_actionable: boolean (true if it's a communication task that requires drafting, false if it's just a reminder/venting)

Example output:
[
  { "id": "1", "recipient": "Priya", "intent": "reply about invoice", "relationship_context": "professional, familiar", "is_actionable": true },
  { "id": "2", "recipient": "Self", "intent": "buy milk", "relationship_context": "none", "is_actionable": false }
]`
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

        actionableItems = extractedItems.filter(item => item.is_actionable);
        
        if (actionableItems.length > 8) {
          overflow = actionableItems.length - 8;
          actionableItems = actionableItems.slice(0, 8);
        }

        if (actionableItems.length === 0) {
          sendEvent('extracted', { items: [], overflow });
          controller.close();
          return;
        }

        // 2. RANK via Groq
        const rankRes = await groqClient.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: `You are an urgency ranking assistant. Given a JSON array of communication tasks, assign an urgency score from 1 (low) to 5 (high) to each.
Return ONLY a JSON object mapping the task ID to its integer score.`
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

        // 3. DRAFT via Gemini (in parallel for now, until Section 3 refactoring)
        const draftPromises = actionableItems.map(async (task) => {
          let retryCount = 0;
          let success = false;
          
          while (!success && retryCount < 2) {
            try {
              let draftContent = '';

              if (simulateError && process.env.NODE_ENV !== 'production' && task.id === actionableItems[0].id) {
                 // Dev override to simulate a broken JSON string
                 draftContent = '{ "message": "This JSON is deliberately broken';
              } else {
                 const draftRes = await geminiClient.chat.completions.create({
                    model: 'gemini-2.5-flash',
                    messages: [
                      {
                        role: 'system',
                        content: `You are an expert ghostwriter. Draft a message based on the user's intent. 
Write ONLY the message body, no subject line, no pleasantries around the output. 
Match the tone to the relationship_context.
Also provide a tone_label and a confidence level (high or low).
Output ONLY a JSON object: { "message": "...", "tone_label": "...", "confidence": "high|low" }`
                      },
                      {
                        role: 'user',
                        content: `Recipient: ${task.recipient}\nIntent: ${task.intent}\nRelationship: ${task.relationship_context}`
                      }
                    ],
                    temperature: 0.7
                  }, { signal: timeoutSignal(20000) }); // 20s timeout

                  draftContent = draftRes.choices[0].message.content || '{}';
              }

              let draftData;
              try {
                draftData = parseJson<any>(draftContent);
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
