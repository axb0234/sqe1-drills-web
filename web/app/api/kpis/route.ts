export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { getDb } from '../../../lib/sqlite';
import { readServerUser } from '../../../lib/user';

export async function GET() {
  const u = readServerUser();
  if (!u?.sub) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const db = getDb();

  const today = db.prepare(`
    SELECT COUNT(*) AS n
    FROM drill_items di
    JOIN drill_sessions ds ON ds.id = di.session_id
    WHERE ds.user_id = ?
      AND DATE(di.answered_at) = DATE('now','localtime')
  `).get(u.sub) as any;

  const last7 = db.prepare(`
    SELECT COUNT(*) AS attempted,
           SUM(CASE WHEN di.is_correct=1 THEN 1 ELSE 0 END) AS correct
    FROM drill_items di
    JOIN drill_sessions ds ON ds.id = di.session_id
    WHERE ds.user_id = ?
      AND di.answered_at >= DATETIME('now','localtime','-7 days')
  `).get(u.sub) as any;

  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const row = db.prepare(`
      SELECT COUNT(*) AS n
      FROM drill_items di
      JOIN drill_sessions ds ON ds.id = di.session_id
      WHERE ds.user_id = ?
        AND DATE(di.answered_at) = DATE('now','localtime', ?)
    `).get(u.sub, i === 0 ? 'start of day' : `-${i} days`) as any;
    if (row.n > 0) streak++; else break;
  }

  return NextResponse.json({
    mcqsToday: today.n || 0,
    weeklyGoal: { attempted: last7.attempted || 0, goal: 150 },
    accuracy7d: (last7.attempted ? Math.round((last7.correct || 0) * 100 / last7.attempted) : null),
    streakDays: streak
  });
}
