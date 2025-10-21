export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../../../lib/sqlite';
import { readServerUser } from '../../../../../lib/user';

export async function GET(_: NextRequest, { params }: { params: { sid: string } }) {
  const u = readServerUser();
  if (!u?.sub) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const db = getDb();
  const sid = params.sid;

  const session = db.prepare(`SELECT id, total FROM drill_sessions WHERE id=? AND user_id=?`).get(sid, u.sub) as any;
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const item = db.prepare(`
    SELECT di.order_index, di.question_id
    FROM drill_items di
    WHERE di.session_id = ?
      AND di.answered_at IS NULL
    ORDER BY di.order_index ASC
    LIMIT 1
  `).get(sid);

  if (!item) {
    const summary = db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN is_correct=1 THEN 1 ELSE 0 END) AS correct,
             ROUND(COALESCE(SUM(elapsed_ms),0) / 1000.0, 2) AS totalTimeSec,
             ROUND(COALESCE(AVG(elapsed_ms),0) / 1000.0, 2) AS avgTimeSec
      FROM drill_items WHERE session_id = ?
    `).get(sid) as any;

    const sess = db.prepare(`SELECT finished_at FROM drill_sessions WHERE id=?`).get(sid) as any;
    if (!sess?.finished_at) {
      const dur = db.prepare(`SELECT COALESCE(SUM(elapsed_ms),0) AS ms FROM drill_items WHERE session_id=?`).get(sid) as any;
      db.prepare(`UPDATE drill_sessions SET finished_at=CURRENT_TIMESTAMP, duration_sec=?, score=? WHERE id=?`)
        .run(Math.round((dur.ms || 0) / 1000), summary.correct ?? 0, sid);
    }

    return NextResponse.json({ done: true, summary });
  }

  const q = db.prepare(`
    SELECT q.id, q.stem, q.answer_index, q.topic, q.rationale_correct, q.source_refs
    FROM questions q WHERE q.id = ?
  `).get(item.question_id) as any;

  const choices = db.prepare(`SELECT label, text, rationale FROM choices WHERE question_id = ? ORDER BY label ASC`).all(q.id);

  return NextResponse.json({
    done: false,
    progress: { index: item.order_index, total: session.total },
    question: {
      id: q.id,
      stem: q.stem,
      topic: q.topic,
      options: choices,
      correctIndex: q.answer_index,
      explanation: q.rationale_correct,
      source: q.source_refs
    }
  });
}
