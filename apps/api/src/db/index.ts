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
  if (!db) {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL;');
    migrate(db);
  }
  return db;
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

export function closeDb(): void {
  db?.close();
  db = undefined;
}
