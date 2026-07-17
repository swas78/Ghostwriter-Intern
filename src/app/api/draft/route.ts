import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { parseJson } from '@/utils/parseJson';

const geminiClient = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY || 'dummy_key',
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
});

export async function POST(req: NextRequest) {
  try {
    const { item, simulate_parse_failure, refine_instruction } = await req.json();

    if (!item) {
      return new Response(JSON.stringify({ error: 'Missing item' }), { status: 400 });
    }

    // Fetch calibration examples
    let calibrationBlock = '';
    let _debugCalibration = {
      queryContext: '',
      returnedExamples: 0,
      systemPrompt: ''
    };
    
    try {
      const db = (await import('@/db/sqlite')).default;
      
      const rawContext = item.relationship_context || '';
      const contextFirstWord = rawContext.split(/[\s,]+/)[0];
      _debugCalibration.queryContext = contextFirstWord;
      
      const stmt = db.prepare(`
        SELECT intent, relationship_context, draft 
        FROM tasks 
        WHERE archived = 1 
          AND draft != '' 
          AND draft IS NOT NULL
          AND relationship_context LIKE '%' || @contextFirstWord || '%'
        ORDER BY updated_at DESC 
        LIMIT 5
      `);
      const examples = stmt.all({ contextFirstWord });
      
      _debugCalibration.returnedExamples = examples ? examples.length : 0;
      
      if (examples && examples.length > 0) {
        calibrationBlock = `\n\nHere are some past approved messages you wrote for a similar context (${item.relationship_context}). Use these to match the user's preferred tone and style:\n`;
        examples.forEach((ex: any, idx: number) => {
          calibrationBlock += `\nExample ${idx + 1}:\nIntent: ${ex.intent}\nDraft: ${ex.draft}\n`;
        });
      }
    } catch (dbErr) {
      console.error("Failed to fetch calibration examples:", dbErr);
    }

    let draftParsed: any = null;
    let retryCount = 0;
    let parseRetries = 0;

    let finalSystemPrompt = '';
    
    if (item.task_type === 'communication' || !item.task_type) {
      finalSystemPrompt = `You are Ghostwriter. Write a draft message for the user. Output ONLY raw JSON matching this schema: { "draft": "the message text", "toneLabel": "descriptive label", "confidence": "high|medium|low" }${calibrationBlock}`;
    } else if (item.task_type === 'chore') {
      finalSystemPrompt = `You are Ghostwriter. The user has a chore or solo task. Draft a brief step-by-step Action Plan or checklist to help them complete it. Output ONLY raw JSON matching this schema: { "draft": "Action Plan:\\n- step 1\\n- step 2", "toneLabel": "Action Plan", "confidence": "high|medium|low" }`;
    } else if (item.task_type === 'meeting') {
      finalSystemPrompt = `You are Ghostwriter. The user has a meeting or appointment. Draft a brief Agenda or prep checklist. Output ONLY raw JSON matching this schema: { "draft": "Meeting Prep:\\n- Goal:\\n- Notes:", "toneLabel": "Meeting Prep", "confidence": "high|medium|low" }`;
    } else {
      finalSystemPrompt = `You are Ghostwriter. Draft a brief note or plan for the user's task. Output ONLY raw JSON matching this schema: { "draft": "the note text", "toneLabel": "Note", "confidence": "high|medium|low" }`;
    }
    
    _debugCalibration.systemPrompt = finalSystemPrompt;

    while (retryCount < 3 && parseRetries < 2) {
      try {
        let draftContent = "";
        
        if (simulate_parse_failure) {
          draftContent = "{ broken json: ";
        } else {
          const draftRes = await geminiClient.chat.completions.create({
            model: 'gemini-2.5-flash',
            messages: [
              {
                role: 'system',
                content: finalSystemPrompt,
              },
              {
                role: 'user',
                content: refine_instruction
                  ? `Original Intent: ${item.task_type === 'communication' ? 'Draft a message to ' + item.recipient + ' about' : 'Handle task'}: ${item.intent}. Context: ${item.relationship_context}.
Current Draft: ${item.draft}
Refinement Instruction: ${refine_instruction}
Please refine the Current Draft based on the Refinement Instruction.`
                  : `${item.task_type === 'communication' || !item.task_type ? 'Draft a message to ' + item.recipient + ' about' : 'Draft a plan/notes for'}: ${item.intent}. Context: ${item.relationship_context}.`,
              }
            ],
            response_format: { type: 'json_object' }
          });
          
          draftContent = draftRes.choices[0]?.message?.content || '{}';
        }
        
        try {
          draftParsed = parseJson(draftContent);
        } catch (parseError: any) {
          parseRetries++;
          if (parseRetries >= 2) {
            // Failed to parse twice, break out to degrade gracefully
            console.log("Failed to parse JSON twice. Giving up.");
            draftParsed = null;
            break; 
          }
          console.log(`JSON Parse Error (retry ${parseRetries}):`, parseError.message);
          continue; // Retry parse immediately by generating a new draft
        }

        if (!draftParsed || !draftParsed.draft) {
          throw new Error("Invalid or missing draft in JSON");
        }
        
        break; // Success
      } catch (err: any) {
        console.error(`Draft network error (retry ${retryCount}):`, err);
        retryCount++;
        if ((err.status === 429 || err.status === 503) && retryCount < 3) {
          await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
        } else if (retryCount < 3) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    // Degrade Gracefully
    let finalStatus = 'drafted';
    if (!draftParsed || !draftParsed.draft) {
      if (refine_instruction) {
        return new Response(JSON.stringify({ error: 'Refinement failed to generate valid output' }), { status: 500 });
      }
      draftParsed = {
        draft: "",
        toneLabel: "Error generating draft",
        confidence: "low"
      };
      finalStatus = 'error';
    }

    // UPDATE SQLite Database
    try {
      const db = (await import('@/db/sqlite')).default;
      const updateStmt = db.prepare(`
        UPDATE tasks 
        SET draft = @draft, toneLabel = @toneLabel, confidence = @confidence, status = @status, updated_at = @updated_at
        WHERE id = @id
      `);
      
      updateStmt.run({
        id: item.id,
        draft: draftParsed.draft,
        toneLabel: draftParsed.toneLabel,
        confidence: draftParsed.confidence,
        status: finalStatus,
        updated_at: Date.now()
      });
    } catch (dbErr) {
      console.error("Failed to update database for draft:", dbErr);
    }

    return new Response(JSON.stringify({
      id: item.id,
      draft: draftParsed.draft,
      toneLabel: draftParsed.toneLabel,
      confidence: draftParsed.confidence,
      status: finalStatus,
      _debug: _debugCalibration
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Draft error:', error);
    return new Response(JSON.stringify({ error: 'Drafting failed' }), { status: 500 });
  }
}
