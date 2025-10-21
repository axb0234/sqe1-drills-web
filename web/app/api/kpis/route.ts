export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { query } from '../../../lib/db';
import { readServerUser } from '../../../lib/user';

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function minusDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

export async function GET() {
  const u = readServerUser();
  if (!u?.sub) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const todayRes = await query<{ n: string | number }>(
    `SELECT COUNT(*) AS n
       FROM drill_items di
       JOIN drill_sessions ds ON ds.id = di.session_id
      WHERE ds.user_id = $1
        AND di.answered_at::date = CURRENT_DATE`,
    [u.sub]
  );
  const mcqsToday = Number(todayRes.rows[0]?.n || 0);

  const last7Res = await query<{
    attempted: string | number | null;
    correct: string | number | null;
  }>(
    `SELECT COUNT(*) AS attempted,
            SUM(CASE WHEN di.is_correct THEN 1 ELSE 0 END) AS correct
       FROM drill_items di
       JOIN drill_sessions ds ON ds.id = di.session_id
      WHERE ds.user_id = $1
        AND di.answered_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'`,
    [u.sub]
  );
  const last7Row = last7Res.rows[0] || { attempted: 0, correct: 0 };
  const attempted = Number(last7Row.attempted || 0);
  const correct = Number(last7Row.correct || 0);

  const streakRes = await query<{ day: string | Date }>(
    `SELECT di.answered_at::date AS day
       FROM drill_items di
       JOIN drill_sessions ds ON ds.id = di.session_id
      WHERE ds.user_id = $1
        AND di.answered_at IS NOT NULL
        AND di.answered_at::date >= CURRENT_DATE - INTERVAL '365 days'
      GROUP BY di.answered_at::date`,
    [u.sub]
  );

  const daySet = new Set(
    streakRes.rows.map((row: { day: string | Date }) =>
      row.day instanceof Date ? row.day.toISOString().slice(0, 10) : row.day
    )
  );
  let streak = 0;
  const today = new Date();
  while (streak < 366) {
    const dateStr = formatDate(minusDays(today, streak));
    if (daySet.has(dateStr)) {
      streak += 1;
    } else {
      break;
    }
  }

  return NextResponse.json({
    mcqsToday,
    weeklyGoal: { attempted, goal: 150 },
    accuracy7d: attempted ? Math.round((correct * 100) / attempted) : null,
    streakDays: streak,
  });
}
