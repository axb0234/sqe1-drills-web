export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../lib/sqlite';
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

  const db = getDb();
  const sid = crypto.randomUUID();

  const seen = db.prepare(`
    SELECT DISTINCT di.question_id
    FROM drill_items di
    JOIN drill_sessions ds ON ds.id = di.session_id
    WHERE ds.user_id = ?
  `).all(u.sub).map((r: any) => r.question_id);

  const notIn = seen.length ? `AND q.id NOT IN (${seen.map(() => '?').join(',')})` : '';
  const params: any[] = [];

  let where = 'WHERE q.is_active = 1 ';
  if (typeof subject === 'number' || /^[0-9]+$/.test(String(subject))) {
    where += 'AND q.subject_id = ? ';
    params.push(Number(subject));
  }
  if (seen.length) params.push(...seen);

  const sampleIds = db.prepare(`
    SELECT q.id
    FROM questions q
    ${where}
    ${notIn}
    ORDER BY RANDOM()
    LIMIT ?
  `).all(...params, length).map((r: any) => r.id);

  if (sampleIds.length < length) {
    return NextResponse.json({
      error: 'Not enough unseen questions in this subject. Try a smaller length.',
      available: sampleIds.length
    }, { status: 400 });
  }

  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO drill_sessions (id, user_id, subject, total) VALUES (?, ?, ?, ?)`)
      .run(sid, u.sub, String(subject), length);

    const ins = db.prepare(`INSERT INTO drill_items (session_id, order_index, question_id) VALUES (?, ?, ?)`);
    sampleIds.forEach((qid: number, idx: number) => ins.run(sid, idx + 1, qid));
  });
  tx();

  return NextResponse.json({ sid });
}
