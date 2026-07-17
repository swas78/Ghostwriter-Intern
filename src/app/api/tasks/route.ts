import { NextRequest, NextResponse } from 'next/server';
import db from '@/db/sqlite';
import { validateLocalToday } from '@/lib/date-utils';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const localTodayParam = url.searchParams.get('local_today');
    let localToday: string | null = null;
    
    if (localTodayParam) {
      localToday = validateLocalToday(localTodayParam);
    }

    // Fetch pending tasks + follow-up tasks
    let stmt;
    if (localToday) {
      stmt = db.prepare(`
        SELECT id, dump_id, recipient, intent, task_type, relationship_context,
               is_actionable, urgency, draft, toneLabel, confidence,
               status, archived, follow_up_date, created_at, updated_at
        FROM tasks 
        WHERE archived = 0 
           OR (archived = 1 AND follow_up_date <= @localToday AND follow_up_dismissed = 0)
        ORDER BY 
          CASE WHEN archived = 1 THEN 0 ELSE 1 END ASC, -- Follow-ups first
          urgency DESC, 
          created_at DESC
      `);
      var tasks = stmt.all({ localToday });
    } else {
      stmt = db.prepare(`
        SELECT id, dump_id, recipient, intent, task_type, relationship_context,
               is_actionable, urgency, draft, toneLabel, confidence,
               status, archived, follow_up_date, created_at, updated_at
        FROM tasks 
        WHERE archived = 0 
        ORDER BY urgency DESC, created_at DESC
      `);
      var tasks = stmt.all();
    }

    // Map boolean back for the client
    const formattedTasks = tasks.map((t: any) => ({
      ...t,
      is_actionable: t.is_actionable === 1
    }));

    return NextResponse.json({ tasks: formattedTasks });
  } catch (error) {
    console.error("GET /api/tasks error:", error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, archived, draft, toneLabel, confidence, status, intent, relationship_context, follow_up_date, follow_up_dismissed } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing task ID' }, { status: 400 });
    }

    const updates: string[] = [];
    const params: any = { id, updated_at: Date.now() };

    if (archived !== undefined) {
      updates.push('archived = @archived');
      params.archived = archived ? 1 : 0;
    }
    if (draft !== undefined) {
      updates.push('draft = @draft');
      params.draft = draft;
    }
    if (toneLabel !== undefined) {
      updates.push('toneLabel = @toneLabel');
      params.toneLabel = toneLabel;
    }
    if (confidence !== undefined) {
      updates.push('confidence = @confidence');
      params.confidence = confidence;
    }
    if (status !== undefined) {
      updates.push('status = @status');
      params.status = status;
    }
    if (intent !== undefined) {
      updates.push('intent = @intent');
      params.intent = intent;
    }
    if (relationship_context !== undefined) {
      updates.push('relationship_context = @relationship_context');
      params.relationship_context = relationship_context;
    }
    if (follow_up_date !== undefined) {
      updates.push('follow_up_date = @follow_up_date');
      params.follow_up_date = follow_up_date;
    }
    if (follow_up_dismissed !== undefined) {
      updates.push('follow_up_dismissed = @follow_up_dismissed');
      params.follow_up_dismissed = follow_up_dismissed ? 1 : 0;
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updates.push('updated_at = @updated_at');

    const updateStmt = db.prepare(`
      UPDATE tasks 
      SET ${updates.join(', ')}
      WHERE id = @id
    `);
    
    updateStmt.run(params);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/tasks error:", error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}
