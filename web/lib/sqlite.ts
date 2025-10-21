// web/lib/sqlite.ts
import BetterSqlite3 from 'better-sqlite3';
import type { Database as BetterSqlite3Database } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

type DBT = BetterSqlite3Database;
declare global {
  // eslint-disable-next-line no-var
  var __sqe_db__: DBT | undefined;
}

function resolveDbPath(): string {
  const directEnv = process.env.QUESTIONS_DB?.trim();
  if (directEnv) return directEnv;

  const dirEnv = process.env.QUESTIONS_DB_DIR?.trim();
  if (dirEnv) return path.resolve(dirEnv, 'questions.sqlite3');

  const candidateBases = new Set<string>();

  // Walk up from the current working directory so the helper can run from
  // either the repo root, the web/ directory, or a packaged build output.
  let cursor = process.cwd();
  while (!candidateBases.has(cursor)) {
    candidateBases.add(path.resolve(cursor, 'ops', 'data'));
    candidateBases.add(path.resolve(cursor, 'app', 'ops', 'data'));
    candidateBases.add(
      path.resolve(cursor, 'app', 'sqe1-drills-web', 'ops', 'data'),
    );
    candidateBases.add(path.resolve(cursor, 'sqe1-drills-web', 'ops', 'data'));

    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }

  // Known deployment targets.
  candidateBases.add('/srv/sqe1prep/app/sqe1-drills-web/ops/data');
  candidateBases.add('/app/ops/data');

  let fallback: string | undefined;
  for (const base of candidateBases) {
    const filePath = path.join(base, 'questions.sqlite3');
    if (fs.existsSync(filePath)) return filePath;
    if (!fallback && fs.existsSync(base)) fallback = filePath;
  }

  // Default to the historical relative location so local development can
  // create a new database if needed.
  return fallback ?? path.resolve(process.cwd(), '..', 'ops', 'data', 'questions.sqlite3');
}

const DB_PATH = resolveDbPath();

export function getDbPath(): string {
  return DB_PATH;
}

function migrate(db: DBT) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY,
      subject_id INTEGER NOT NULL,
      stem TEXT NOT NULL,
      topic TEXT,
      answer_index INTEGER NOT NULL,
      rationale_correct TEXT,
      source_refs TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(subject_id) REFERENCES subjects(id)
    );

    CREATE INDEX IF NOT EXISTS ix_questions_subject ON questions(subject_id);
    CREATE INDEX IF NOT EXISTS ix_questions_active ON questions(is_active);

    CREATE TABLE IF NOT EXISTS drill_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      subject TEXT NOT NULL,
      total INTEGER NOT NULL,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME,
      duration_sec INTEGER DEFAULT 0,
      score INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS drill_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      user_answer INTEGER,
      is_correct INTEGER,
      answered_at DATETIME,
      elapsed_ms INTEGER,
      UNIQUE(session_id, order_index)
    );

    CREATE INDEX IF NOT EXISTS ix_drill_items_session ON drill_items(session_id);
    CREATE INDEX IF NOT EXISTS ix_drill_items_q ON drill_items(question_id);
  `);
}

export function getDb(): DBT {
  if (global.__sqe_db__) return global.__sqe_db__;
  console.debug(`[sqlite] Opening questions database at ${DB_PATH}`);
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new BetterSqlite3(DB_PATH);
  migrate(db);
  global.__sqe_db__ = db;
  return db;
}
