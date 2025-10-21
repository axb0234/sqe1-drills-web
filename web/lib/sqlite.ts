import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

type DBT = Database.Database;
declare global { // keep a single connection in dev/hot-reload
  // eslint-disable-next-line no-var
  var __sqe_db__: DBT | undefined;
}

function resolveDbPath(): string {
  // 1) Explicit override if you want
  const env = process.env.QUESTIONS_DB?.trim();
  if (env) return env;

  // 2) Standard repo layout: app runs from /web, DB lives in ../ops/data
  const p1 = path.resolve(process.cwd(), '..', 'ops', 'data', 'questions.sqlite3');
  if (fs.existsSync(path.dirname(p1))) return p1;

  // 3) Container fallback (e.g., /app is WORKDIR)
  return '/app/ops/data/questions.sqlite3';
}

const DB_PATH = resolveDbPath();

function migrate(db: DBT) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

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
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  migrate(db);
  global.__sqe_db__ = db;
  return db;
}
