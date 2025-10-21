export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { getDb, getDbPath } from '../../../lib/sqlite';

export async function GET() {
  const db = getDb();
  const rows = db.prepare(`SELECT id, name FROM subjects ORDER BY name`).all();
  console.debug(
    `[subjects] Loaded ${rows.length} subjects from ${getDbPath()}`,
  );
  return NextResponse.json({
    subjects: [{ id: 'ALL', name: 'ALL Subjects' }, ...rows],
    debug: {
      dbPath: getDbPath(),
      rowCount: rows.length,
    },
  });
}
