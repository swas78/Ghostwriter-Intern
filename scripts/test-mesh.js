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

const rawInput = "call the plumber back, need to reply to priya about the invoice — she's been asking twice now — and I completely forgot to follow up with that client from tuesday, also should tell rahul I can't make dinner tonight. oh and remind me to buy milk.";

async function run() {
  console.log("=== Phase 2: Mesh API Smoke Test ===\n");
  
  // 1. EXTRACT
  console.log("-> 1. Extracting tasks...");
  const extractResponse = await client.chat.completions.create({
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
      {
        role: 'user',
        content: rawInput
      }
    ],
    temperature: 0.1
  });

  const extractRaw = extractResponse.choices[0].message.content;
  console.log("Raw Extract output:\n", extractRaw);
  
  // Clean JSON
  let extractedItems = [];
  try {
    let cleanStr = extractRaw.trim();
    if (cleanStr.startsWith('```')) {
      const lines = cleanStr.split('\n');
      lines.shift();
      if (lines.length > 0 && lines[lines.length-1].startsWith('```')) lines.pop();
      cleanStr = lines.join('\n');
    }
    extractedItems = JSON.parse(cleanStr);
  } catch (e) {
    console.error("Failed to parse Extract JSON", e);
    process.exit(1);
  }

  const actionableItems = extractedItems.filter(item => item.is_actionable);
  console.log("\n-> Actionable items found:", actionableItems.length);
  
  if (actionableItems.length === 0) return;

  // 2. RANK
  console.log("\n-> 2. Ranking tasks...");
  const rankResponse = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are an urgency ranking assistant. Given a JSON array of communication tasks, assign an urgency score from 1 (low) to 5 (high) to each.
Return a JSON object mapping the task ID to its integer score. Output ONLY raw JSON.`
      },
      {
        role: 'user',
        content: JSON.stringify(actionableItems)
      }
    ],
    temperature: 0.1
  });
  
  const rankRaw = rankResponse.choices[0].message.content;
  console.log("Raw Rank output:\n", rankRaw);
  
  let rankings = {};
  try {
    let cleanStr = rankRaw.trim();
    if (cleanStr.startsWith('```')) {
      const lines = cleanStr.split('\n');
      lines.shift();
      if (lines.length > 0 && lines[lines.length-1].startsWith('```')) lines.pop();
      cleanStr = lines.join('\n');
    }
    rankings = JSON.parse(cleanStr);
  } catch (e) {
    console.error("Failed to parse Rank JSON", e);
    process.exit(1);
  }

  actionableItems.forEach(item => {
    item.urgency = rankings[item.id] || 3;
  });
  
  actionableItems.sort((a, b) => b.urgency - a.urgency);
  console.log("\n-> Ranked items:\n", actionableItems.map(i => `${i.recipient} (Urgency: ${i.urgency})`));
  
  // 3. DRAFT
  console.log("\n-> 3. Drafting top priority task (simulating parallel)...");
  const topTask = actionableItems[0];
  
  console.log(`Drafting for: ${topTask.recipient}...`);
  try {
    const draftResponse = await client.chat.completions.create({
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
          content: `Recipient: ${topTask.recipient}\nIntent: ${topTask.intent}\nRelationship: ${topTask.relationship_context}`
        }
      ],
      temperature: 0.7
    });

    const draftRaw = draftResponse.choices[0].message.content;
    console.log("Raw Draft output:\n", draftRaw);
  } catch (e) {
    console.error("Drafting failed (model might not be available or syntax error):", e.message);
  }
}

run().catch(console.error);
