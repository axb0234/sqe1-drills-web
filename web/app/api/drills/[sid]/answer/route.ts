export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../../../lib/db';
import { readServerUser } from '../../../../../lib/user';

type Body = { questionId: number; orderIndex: number; answerIndex: number; elapsedMs: number };

export async function POST(req: NextRequest, { params }: { params: { sid: string } }) {
  const u = readServerUser();
  if (!u?.sub) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sid = params.sid;

  const sessionRes = await query('SELECT id FROM drill_sessions WHERE id = $1 AND user_id = $2', [sid, u.sub]);
  if (!sessionRes.rowCount) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = (await req.json()) as Body;

  const questionRes = await query<{ answer_index: number }>(
    'SELECT answer_index FROM questions WHERE id = $1',
    [body.questionId]
  );
  const question = questionRes.rows[0];
  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 });

  const isCorrect = body.answerIndex === question.answer_index;

  const updateRes = await query(
    `UPDATE drill_items
        SET user_answer = $1,
            is_correct = $2,
            elapsed_ms = $3,
            answered_at = NOW()
      WHERE session_id = $4 AND order_index = $5 AND question_id = $6`,
    [
      body.answerIndex,
      isCorrect,
      Math.max(0, body.elapsedMs | 0),
      sid,
      body.orderIndex,
      body.questionId,
    ]
  );

  if (updateRes.rowCount === 0) {
    return NextResponse.json({ error: 'Drill item not found' }, { status: 404 });
  }

  await query(
    `UPDATE drill_sessions
        SET score = (
          SELECT COALESCE(SUM(CASE WHEN is_correct THEN 1 ELSE 0 END), 0)
            FROM drill_items WHERE session_id = $1
        )
      WHERE id = $1`,
    [sid]
  );

  return NextResponse.json({ correct: isCorrect, correctIndex: question.answer_index });
}
