export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../../../lib/sqlite';
import { readServerUser } from '../../../../../lib/user';

type Body = { questionId: number; orderIndex: number; answerIndex: number; elapsedMs: number };

export async function POST(req: NextRequest, { params }: { params: { sid: string } }) {
  const u = readServerUser();
  if (!u?.sub) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sid = params.sid;
  const db = getDb();

  const session = db.prepare(`SELECT id FROM drill_sessions WHERE id=? AND user_id=?`).get(sid, u.sub);
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = (await req.json()) as Body;

  const q = db.prepare(`SELECT answer_index FROM questions WHERE id = ?`).get(body.questionId) as any;
  if (!q) return NextResponse.json({ error: 'Question not found' }, { status: 404 });

  const isCorrect = Number(body.answerIndex === q.answer_index);

  const res = db.prepare(`
    UPDATE drill_items
    SET user_answer = ?, is_correct = ?, elapsed_ms = ?, answered_at = CURRENT_TIMESTAMP
    WHERE session_id = ? AND order_index = ? AND question_id = ?
  `).run(body.answerIndex, isCorrect, Math.max(0, body.elapsedMs|0), sid, body.orderIndex, body.questionId);

  if (res.changes === 0) return NextResponse.json({ error: 'Drill item not found' }, { status: 404 });

  db.prepare(`
    UPDATE drill_sessions
    SET score = (
      SELECT COALESCE(SUM(CASE WHEN is_correct=1 THEN 1 ELSE 0 END), 0)
      FROM drill_items WHERE session_id = ?
    )
    WHERE id = ?
  `).run(sid, sid);

  return NextResponse.json({ correct: !!isCorrect, correctIndex: q.answer_index });
}
