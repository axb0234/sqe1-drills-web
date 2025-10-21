export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../../../lib/db';
import { readServerUser } from '../../../../../lib/user';

type DrillItemRow = { order_index: number; question_id: number };
type QuestionRow = {
  id: number;
  stem: string;
  answer_index: number;
  topic: string | null;
  rationale_correct: string | null;
  source_refs: any;
};
type ChoiceRow = { label: string; text: string; rationale: string | null };

export async function GET(_: NextRequest, { params }: { params: { sid: string } }) {
  const u = readServerUser();
  if (!u?.sub) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sid = params.sid;

  const sessionRes = await query<{ id: string; total: number }>(
    'SELECT id, total FROM drill_sessions WHERE id = $1 AND user_id = $2',
    [sid, u.sub]
  );
  const session = sessionRes.rows[0];
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const itemRes = await query<DrillItemRow>(
    `SELECT di.order_index, di.question_id
       FROM drill_items di
      WHERE di.session_id = $1
        AND di.answered_at IS NULL
      ORDER BY di.order_index ASC
      LIMIT 1`,
    [sid]
  );
  const item = itemRes.rows[0];

  if (!item) {
    const summaryRes = await query<{
      total: string | number | null;
      correct: string | number | null;
      total_ms: string | number | null;
      avg_ms: string | number | null;
    }>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct,
              SUM(COALESCE(elapsed_ms, 0)) AS total_ms,
              AVG(COALESCE(elapsed_ms, 0)) AS avg_ms
         FROM drill_items
        WHERE session_id = $1`,
      [sid]
    );
    const summaryRow = summaryRes.rows[0] || {
      total: 0,
      correct: 0,
      total_ms: 0,
      avg_ms: 0,
    };

    const totalMs = Number(summaryRow.total_ms || 0);
    const avgMs = Number(summaryRow.avg_ms || 0);
    const total = Number(summaryRow.total || 0);
    const correct = Number(summaryRow.correct || 0);

    const finishedRes = await query<{ finished_at: Date | null }>(
      'SELECT finished_at FROM drill_sessions WHERE id = $1',
      [sid]
    );
    const finished = finishedRes.rows[0];
    if (!finished?.finished_at) {
      await query(
        'UPDATE drill_sessions SET finished_at = NOW(), duration_sec = $1, score = $2 WHERE id = $3',
        [Math.round(totalMs / 1000), correct, sid]
      );
    }

    return NextResponse.json({
      done: true,
      summary: {
        total,
        correct,
        totalTimeSec: Math.round((totalMs / 1000) * 100) / 100,
        avgTimeSec: Math.round((avgMs / 1000) * 100) / 100,
      },
    });
  }

  const questionRes = await query<QuestionRow>(
    `SELECT q.id, q.stem, q.answer_index, q.topic, q.rationale_correct, q.source_refs
       FROM questions q WHERE q.id = $1`,
    [item.question_id]
  );
  const q = questionRes.rows[0];
  if (!q) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  }

  const choicesRes = await query<ChoiceRow>(
    'SELECT label, text, rationale FROM choices WHERE question_id = $1 ORDER BY label ASC',
    [q.id]
  );
  const choices = choicesRes.rows.map((c: ChoiceRow) => ({
    label: c.label,
    text: c.text,
    rationale: c.rationale ?? '',
  }));
  const sourceRefs = Array.isArray(q.source_refs)
    ? q.source_refs
    : typeof q.source_refs === 'string'
      ? [q.source_refs]
      : [];

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
      source: sourceRefs.join(', '),
    },
  });
}
