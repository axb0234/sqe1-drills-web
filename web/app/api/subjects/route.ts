export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { query, getConnectionInfo } from '../../../lib/db';

type SubjectRow = { id: number; name: string };

export async function GET() {
  const res = await query<SubjectRow>(
    'SELECT id, name FROM subjects ORDER BY name'
  );
  const subjects = res.rows;

  console.debug(
    `[subjects] Loaded ${subjects.length} subjects from Postgres`,
    getConnectionInfo()
  );

  return NextResponse.json({
    subjects: [{ id: 'ALL', name: 'ALL Subjects' }, ...subjects],
    debug: {
      connection: getConnectionInfo(),
      rowCount: subjects.length,
    },
  });
}
