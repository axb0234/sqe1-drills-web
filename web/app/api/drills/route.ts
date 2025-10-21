export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '../../../lib/db';
import { readServerUser } from '../../../lib/user';
import crypto from 'crypto';

type Body = { subject: string | number; length: number };

export async function POST(req: NextRequest) {
  const u = readServerUser();
  if (!u?.sub) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json()) as Body;
  const { subject, length } = body;
  if (!length || length < 1 || length > 200) {
    return NextResponse.json({ error: 'Invalid length' }, { status: 400 });
  }

  const sid = crypto.randomUUID();

  const seenRes = await query<{ question_id: number }>(
    `SELECT DISTINCT di.question_id
       FROM drill_items di
       JOIN drill_sessions ds ON ds.id = di.session_id
      WHERE ds.user_id = $1`,
    [u.sub]
  );
  const seen = seenRes.rows.map((r: { question_id: number }) => Number(r.question_id));

  let whereClause = 'WHERE q.is_active = TRUE';
  const params: Array<number | number[]> = [];
  let paramIndex = 1;

  if (typeof subject === 'number' || /^[0-9]+$/.test(String(subject))) {
    whereClause += ` AND q.subject_id = $${paramIndex++}`;
    params.push(Number(subject));
  }

  if (seen.length) {
    whereClause += ` AND NOT (q.id = ANY($${paramIndex++}::int[]))`;
    params.push(seen);
  }

  const limitIdx = paramIndex++;
  const sampleQuery = `
    SELECT q.id
      FROM questions q
      ${whereClause}
      ORDER BY RANDOM()
      LIMIT $${limitIdx}
  `;
  const sampleRes = await query<{ id: number }>(sampleQuery, [...params, length]);
  const sampleIds = sampleRes.rows.map((r: { id: number }) => Number(r.id));

  if (sampleIds.length < length) {
    return NextResponse.json({
      error: 'Not enough unseen questions in this subject. Try a smaller length.',
      available: sampleIds.length,
    }, { status: 400 });
  }

  await withTransaction(async (client) => {
    await client.query(
      'INSERT INTO drill_sessions (id, user_id, subject, total) VALUES ($1, $2, $3, $4)',
      [sid, u.sub, String(subject), length]
    );

    const values: string[] = [];
    const insertParams: Array<string | number> = [sid];
    let insertIdx = 2;
    sampleIds.forEach((qid: number, orderIdx: number) => {
      values.push(`($1, $${insertIdx}, $${insertIdx + 1})`);
      insertParams.push(orderIdx + 1, qid);
      insertIdx += 2;
    });

    await client.query(
      `INSERT INTO drill_items (session_id, order_index, question_id) VALUES ${values.join(', ')}`,
      insertParams
    );
  });

  return NextResponse.json({ sid });
}
