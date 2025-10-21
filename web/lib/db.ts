import { Pool, PoolClient, PoolConfig, QueryResult } from 'pg';

type ResolvedConfig = {
  connectionString?: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  ssl: boolean;
};

type ConnectionInfo = {
  host: string;
  port: number;
  database: string;
  user: string;
  ssl: boolean;
};

const resolvedConfig: ResolvedConfig = resolveConfig();
let pool: Pool | undefined;
let schemaPromise: Promise<void> | null = null;

function resolveConfig(): ResolvedConfig {
  const direct =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.QUESTIONS_DSN;

  const ssl = shouldUseSsl();

  if (direct) {
    try {
      const url = new URL(direct);
      return {
        connectionString: direct,
        host: url.hostname,
        port: Number(url.port || '5432'),
        database: url.pathname.replace(/^\//, '') ||
          process.env.PGDATABASE ||
          process.env.APP_DB ||
          'sqe1',
        user: url.username ||
          process.env.PGUSER ||
          process.env.APP_DB_USER ||
          'app',
        ssl,
      };
    } catch {
      // Fallback to default parsing if the URL constructor fails
    }
  }

  return {
    host: process.env.PGHOST || process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.PGPORT || process.env.POSTGRES_PORT || '5432'),
    database: process.env.PGDATABASE || process.env.APP_DB || 'sqe1',
    user: process.env.PGUSER || process.env.APP_DB_USER || 'app',
    password: process.env.PGPASSWORD || process.env.APP_DB_PASS,
    ssl,
  };
}

function shouldUseSsl(): boolean {
  const mode = (process.env.PGSSLMODE || process.env.POSTGRES_SSLMODE || '').toLowerCase();
  if (['require', 'verify-ca', 'verify-full'].includes(mode)) {
    return true;
  }
  const flag = (process.env.POSTGRES_SSL || '').toLowerCase();
  return ['1', 'true', 'yes'].includes(flag);
}

function getPool(): Pool {
  if (pool) return pool;

  const { connectionString, host, port, database, user, password, ssl } = resolvedConfig;
  const config: PoolConfig = connectionString
    ? { connectionString }
    : { host, port, database, user, password };

  if (ssl) {
    config.ssl = { rejectUnauthorized: false };
  }

  pool = new Pool(config);
  pool.on('error', (err) => {
    console.error('[pg] Unexpected client error', err);
  });
  return pool;
}

async function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const client = await getPool().connect();
      try {
        const statements = [
          `CREATE TABLE IF NOT EXISTS subjects (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE
          )`,
          `CREATE TABLE IF NOT EXISTS questions (
            id SERIAL PRIMARY KEY,
            subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
            topic TEXT NOT NULL,
            stem TEXT NOT NULL,
            answer_index INTEGER NOT NULL,
            rationale_correct TEXT NOT NULL,
            source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )`,
          `CREATE TABLE IF NOT EXISTS choices (
            id SERIAL PRIMARY KEY,
            question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
            label TEXT NOT NULL,
            text TEXT NOT NULL,
            rationale TEXT NOT NULL,
            UNIQUE (question_id, label)
          )`,
          `CREATE INDEX IF NOT EXISTS ix_choices_question ON choices(question_id)`,
          `CREATE INDEX IF NOT EXISTS ix_questions_subject ON questions(subject_id)`,
          `CREATE INDEX IF NOT EXISTS ix_questions_active ON questions(is_active)`,
          `CREATE TABLE IF NOT EXISTS drill_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            subject TEXT NOT NULL,
            total INTEGER NOT NULL,
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            finished_at TIMESTAMPTZ,
            duration_sec INTEGER DEFAULT 0,
            score INTEGER DEFAULT 0
          )`,
          `CREATE TABLE IF NOT EXISTS drill_items (
            id SERIAL PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES drill_sessions(id) ON DELETE CASCADE,
            order_index INTEGER NOT NULL,
            question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
            user_answer INTEGER,
            is_correct BOOLEAN,
            answered_at TIMESTAMPTZ,
            elapsed_ms INTEGER,
            UNIQUE (session_id, order_index)
          )`,
          `CREATE INDEX IF NOT EXISTS ix_drill_items_session ON drill_items(session_id)`,
          `CREATE INDEX IF NOT EXISTS ix_drill_items_question ON drill_items(question_id)`
        ];

        for (const stmt of statements) {
          await client.query(stmt);
        }
      } finally {
        client.release();
      }
    })();
  }

  await schemaPromise;
}

export async function query<T = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<QueryResult<T>> {
  await ensureSchema();
  return getPool().query<T>(text, params);
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export function getConnectionInfo(): ConnectionInfo {
  const { host, port, database, user, ssl } = resolvedConfig;
  return { host, port, database, user, ssl };
}
