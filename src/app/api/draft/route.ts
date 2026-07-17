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

    const finalSystemPrompt = `You are Ghostwriter. Write a draft message for the user. Output ONLY raw JSON matching this schema: { "draft": "the message text", "toneLabel": "descriptive label", "confidence": "high|medium|low" }${calibrationBlock}`;
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
                  ? `Original Intent: Draft a message to ${item.recipient} about: ${item.intent}. Context: ${item.relationship_context}.\nCurrent Draft: ${item.draft}\nRefinement Instruction: ${refine_instruction}\nPlease refine the Current Draft based on the Refinement Instruction. Ensure it still serves the Original Intent and maintains the appropriate Context.`
                  : `Draft a message to ${item.recipient} about: ${item.intent}. Context: ${item.relationship_context}.`,
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
