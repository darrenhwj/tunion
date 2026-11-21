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

export function migrate(database: DatabaseSync): void {
  database.exec(readFileSync(resolve(here, 'schema.sql'), 'utf8'));
  // Databases created before threaded replies lack parent_reply_id; add it in place.
  const cols = database.prepare('PRAGMA table_info(replies)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'parent_reply_id')) {
    database.exec('ALTER TABLE replies ADD COLUMN parent_reply_id INTEGER REFERENCES replies(id) ON DELETE CASCADE');
  }
  database.exec('CREATE INDEX IF NOT EXISTS idx_replies_parent ON replies(parent_reply_id)');
}

export function closeDb(): void {
  db?.close();
  db = undefined;
}
