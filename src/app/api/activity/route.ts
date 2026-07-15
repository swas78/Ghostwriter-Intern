import { NextRequest, NextResponse } from 'next/server';
import db from '@/db/sqlite';
import { validateLocalToday } from '@/lib/date-utils';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const localToday = validateLocalToday(body.local_today);

    const stmt = db.prepare(`
      INSERT INTO daily_activity (date, completions) 
      VALUES (@date, 1) 
      ON CONFLICT(date) DO UPDATE SET completions = completions + 1
    `);
    
    stmt.run({ date: localToday });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("POST /api/activity error:", error);
    return NextResponse.json({ error: error.message || 'Failed to log activity' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const localToday = validateLocalToday(url.searchParams.get('local_today'));

    const stmt = db.prepare(`
      SELECT date FROM daily_activity ORDER BY date DESC
    `);
    const rows = stmt.all() as { date: string }[];
    
    // Create a Set of active dates for quick lookup
    const activeDates = new Set(rows.map(r => r.date));

    let streak = 0;
    
    // Parse localToday to walk backwards in local time correctly
    // We treat localToday as UTC midnight just for adding/subtracting days cleanly
    let currentDate = new Date(`${localToday}T00:00:00Z`);

    // Check today
    const todayStr = currentDate.toISOString().split('T')[0];
    if (activeDates.has(todayStr)) {
      streak++;
      currentDate.setUTCDate(currentDate.getUTCDate() - 1);
    } else {
      // If today is NOT active, we check if yesterday is active (grace for "hasn't done anything YET today")
      currentDate.setUTCDate(currentDate.getUTCDate() - 1);
      const yesterdayStr = currentDate.toISOString().split('T')[0];
      if (activeDates.has(yesterdayStr)) {
        streak++;
        currentDate.setUTCDate(currentDate.getUTCDate() - 1);
      } else {
        // Neither today nor yesterday is active. Streak is 0.
        return NextResponse.json({ streak: 0 });
      }
    }

    // Now walk backward continuously as long as the previous day exists
    while (true) {
      const checkStr = currentDate.toISOString().split('T')[0];
      if (activeDates.has(checkStr)) {
        streak++;
        currentDate.setUTCDate(currentDate.getUTCDate() - 1);
      } else {
        break;
      }
    }

    return NextResponse.json({ streak });
  } catch (error: any) {
    console.error("GET /api/activity error:", error);
    return NextResponse.json({ error: error.message || 'Failed to fetch streak' }, { status: 500 });
  }
}
