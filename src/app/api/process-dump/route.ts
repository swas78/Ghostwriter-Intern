import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { parseJson } from '@/utils/parseJson';

const groqClient = new OpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY || 'dummy_key',
});

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text) {
      return new Response(JSON.stringify({ error: 'Missing text' }), { status: 400 });
    }

    // 1. EXTRACT via Groq
    const extractRes = await groqClient.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: `You are an extraction assistant. Extract actionable communication tasks from the user's messy brain dump.
CRITICAL RULES:
1. The user's input is a brain dump. Distinct thoughts, sentences, or names are often completely unrelated. DO NOT combine separate tasks (e.g. "Buy groceries. Email Sarah." = TWO independent tasks. Do not assume the email is about groceries).
2. DEFINITION OF ACTIONABLE: \`is_actionable\` MUST be \`true\` ONLY if the task requires drafting a written message (email, text, slack, etc.) to a specific person.
3. If a task is a general chore, a physical action, or something that doesn't involve drafting a message to someone (e.g., "buy groceries", "do laundry", "go to the bank"), set \`is_actionable: false\` and recipient as "Self" or "None". 
4. A phone call ("call mom") CAN be actionable if it implies sending a message to schedule the call, but a chore ("buy milk") NEVER is.

Return ONLY a JSON array of objects. Each object must have:
- id: a unique string ID
- recipient: string (name or descriptor, but if ambiguous or just 'him/her/them', output 'unclear')
- intent: string (intent of the message, including any mentioned deadlines, timing, or urgency keywords)
- relationship_context: string (must be exactly one of: "professional", "casual", "family", "unknown")
- is_actionable: boolean (true ONLY if it's a communication task that requires drafting a message to a specific person)

Example output:
[
  { "id": "1", "recipient": "Priya", "intent": "reply about invoice ASAP", "relationship_context": "professional", "is_actionable": true },
  { "id": "2", "recipient": "Self", "intent": "buy milk by tonight", "relationship_context": "unknown", "is_actionable": false }
]`
        },
        { role: 'user', content: text }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' } // Just to be safe, but wait, Groq requires 'json_object' but we specified array. We will just use standard completion since the prompt asks for JSON.
    });

    let extractedItems: any = [];
    try {
      extractedItems = parseJson<any>(extractRes.choices[0].message.content || '[]');
      if (!Array.isArray(extractedItems)) {
        if (extractedItems && extractedItems.items && Array.isArray(extractedItems.items)) {
          extractedItems = extractedItems.items;
        } else if (extractedItems && typeof extractedItems === 'object' && !Array.isArray(extractedItems) && extractedItems.id) {
          extractedItems = [extractedItems];
        } else {
          extractedItems = [];
        }
      }
    } catch (e) {
      console.error("Extraction JSON parsing failed", e);
      extractedItems = [];
    }

    let actionableItems = extractedItems.filter((item: any) => item.is_actionable);
    
    if (actionableItems.length === 0) {
      return new Response(JSON.stringify({ items: [], overflow: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. RANK via Groq
    const rankPrompt = `You are an urgency ranking assistant. Given a JSON array of communication tasks, assign an urgency score from 1 (low) to 5 (high) to each based STRICTLY on the following criteria:
- 5: Explicitly marked as URGENT, "ASAP", or needed "today".
- 4: Needed very soon (e.g., "tomorrow", "this morning").
- 3: Standard task, no specific deadline mentioned.
- 2: Sometime this week, low priority.
- 1: "Whenever", "no rush", or explicitly low priority.

Return ONLY a JSON object mapping the task ID to its integer score. For example: {"1": 5, "2": 3}. DO NOT output any other text, markdown, or explanations. ONLY output the JSON object.`;

    const rankRes = await groqClient.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: rankPrompt
        },
        { role: 'user', content: JSON.stringify(actionableItems) }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    let rankings: Record<string, number> = {};
    try {
      rankings = parseJson<Record<string, number>>(rankRes.choices[0].message.content || '{}');
    } catch (e) {
      console.error("Rank JSON parsing failed", e);
    }

    actionableItems.forEach((item: any) => {
      item.urgency = rankings[item.id] || 3;
    });

    actionableItems.sort((a: any, b: any) => b.urgency - a.urgency);

    // Filter to top 8 items
    let overflow = 0;
    if (actionableItems.length > 8) {
      overflow = actionableItems.length - 8;
      actionableItems = actionableItems.slice(0, 8);
    }

    // 3. PERSIST via SQLite
    const db = (await import('@/db/sqlite')).default;
    const dumpId = `dump-${Date.now()}`;
    const now = Date.now();

    // Map extracted data to standard task format
    const persistedItems = actionableItems.map((item: any) => ({
      id: `${dumpId}-${item.id}`,
      dump_id: dumpId,
      recipient: item.recipient || 'unclear',
      intent: item.intent || '',
      relationship_context: item.relationship_context || 'unclear',
      is_actionable: item.is_actionable ? 1 : 0,
      urgency: item.urgency || 3,
      draft: '',
      toneLabel: '',
      confidence: '',
      status: 'pending',
      archived: 0,
      created_at: now,
      updated_at: now
    }));

    // Bulk insert inside a transaction
    const insert = db.prepare(`
      INSERT INTO tasks (
        id, dump_id, recipient, intent, relationship_context, 
        is_actionable, urgency, draft, toneLabel, confidence, 
        status, archived, created_at, updated_at
      ) VALUES (
        @id, @dump_id, @recipient, @intent, @relationship_context, 
        @is_actionable, @urgency, @draft, @toneLabel, @confidence, 
        @status, @archived, @created_at, @updated_at
      )
    `);

    const insertMany = db.transaction((items) => {
      for (const item of items) {
        insert.run(item);
      }
    });

    insertMany(persistedItems);

    return new Response(JSON.stringify({ items: persistedItems, overflow }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ error: 'Processing failed' }), { status: 500 });
  }
}
