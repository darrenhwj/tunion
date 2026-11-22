import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(here, '../..');

export const DB_PATH = process.env.DATABASE_PATH
  ? resolve(process.cwd(), process.env.DATABASE_PATH)
  : resolve(apiRoot, 'data/tunion.db');

let db: DatabaseSync | undefined;

/** Opens (and lazily creates) the SQLite database, applying the schema. */
export function getDb(): DatabaseSync {
  if (!db) db = openDatabase(DB_PATH);
  return db;
}

/** Opens (creating if needed) the database at `path` and applies migrations. */
export function openDatabase(path: string): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  database.exec('PRAGMA journal_mode = WAL;');
  migrate(database);
  return database;
}

/**
 * Applies schema.sql, upgrading databases created by earlier versions in place.
 * tutoring_requests gained statuses ('confirmed','rejected') and columns; SQLite cannot alter a CHECK
 * constraint, so an old table is renamed, recreated from schema.sql, and its rows copied across.
 */
export function migrate(database: DatabaseSync): void {
  const existing = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tutoring_requests'").get() as
    | { sql: string }
    | undefined;
  const legacyRequests = !!existing && !existing.sql.includes("'rejected'");
  if (legacyRequests) {
    database.exec('PRAGMA foreign_keys = OFF;');
    database.exec('ALTER TABLE tutoring_requests RENAME TO tutoring_requests_legacy;');
  }
  database.exec(readFileSync(resolve(here, 'schema.sql'), 'utf8'));
  // Databases created before threaded replies lack parent_reply_id; add it in place.
  const cols = database.prepare('PRAGMA table_info(replies)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'parent_reply_id')) {
    database.exec('ALTER TABLE replies ADD COLUMN parent_reply_id INTEGER REFERENCES replies(id) ON DELETE CASCADE');
  }
  database.exec('CREATE INDEX IF NOT EXISTS idx_replies_parent ON replies(parent_reply_id)');
  // Databases created before file uploads lack the resource file columns; add them in place (existing rows become link-style).
  const resourceCols = (database.prepare('PRAGMA table_info(resources)').all() as { name: string }[]).map((c) => c.name);
  for (const [col, ddl] of [
    ['stored_name', 'TEXT'], ['original_filename', 'TEXT'], ['mime_type', 'TEXT'], ['size_bytes', 'INTEGER'],
  ] as const) {
    if (!resourceCols.includes(col)) database.exec(`ALTER TABLE resources ADD COLUMN ${col} ${ddl}`);
  }
  // Databases created before CSV import lack these columns; add them in place (existing rows: visible, 'current', active tutor).
  for (const [table, col, ddl] of [
    ['users', 'is_hidden', 'INTEGER NOT NULL DEFAULT 0'],
    ['courses', 'is_hidden', 'INTEGER NOT NULL DEFAULT 0'],
    ['tutors', 'is_active', 'INTEGER NOT NULL DEFAULT 1'],
    ['discussions', 'deleted_at', 'TEXT'],
    ['discussions', 'deleted_by_id', 'INTEGER REFERENCES users(id) ON DELETE SET NULL'],
    ['enrollments', 'status', "TEXT NOT NULL DEFAULT 'current' CHECK (status IN ('current','completed'))"],
  ] as const) {
    const names = (database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    if (!names.includes(col)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
  }
  renameLegacyAdmin(database);
  if (legacyRequests) {
    database.exec('BEGIN');
    try {
      database.exec(`INSERT INTO tutoring_requests (id, course_id, student_id, tutor_id, topic, details, status, created_at)
        SELECT id, course_id, student_id, tutor_id, topic, details, status, created_at FROM tutoring_requests_legacy`);
      database.exec('DROP TABLE tutoring_requests_legacy');
      database.exec('COMMIT');
    } catch (err) {
      database.exec('ROLLBACK');
      throw err;
    }
  }
  database.exec('PRAGMA foreign_keys = ON;');
}

/**
 * The demo admin was originally seeded as "Dana Whitfield" and is now "Hani Karam". Targeted and idempotent: only
 * the account(s) with role 'admin' that still carry the old name are touched (id, email, role and all data are kept),
 * and once renamed this matches nothing.
 */
export function renameLegacyAdmin(database: DatabaseSync): void {
  database.prepare("UPDATE users SET name = 'Hani Karam' WHERE role = 'admin' AND name = 'Dana Whitfield'").run();
}

export function closeDb(): void {
  db?.close();
  db = undefined;
}
