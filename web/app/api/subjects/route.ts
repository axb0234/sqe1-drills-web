export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { getDb } from '../../../lib/sqlite';

export async function GET() {
  const db = getDb();
  const rows = db.prepare(`SELECT id, name FROM subjects ORDER BY name`).all();
  return NextResponse.json({ subjects: [{ id: 'ALL', name: 'ALL Subjects' }, ...rows] });
}
