import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../db';

export interface TargetResult<T> { value: T; backupPath?: string }

/**
 * Runs `fn` against the database at `dbPath`.
 * - Dry run: the source is opened read-only and copied (VACUUM INTO) to a temp file; `fn` runs on the copy, which is then
 *   deleted. The real database is never written, not even by schema migrations.
 * - Apply: a consistent backup is written to `<db dir>/backups/` first, then `fn` runs on the real database.
 * The database must already exist; a missing path is an error (it is never silently created).
 */
export function withTarget<T>(dbPath: string, apply: boolean, fn: (db: DatabaseSync) => T): TargetResult<T> {
  if (!existsSync(dbPath)) throw new Error(`Database not found: ${dbPath} (run the app once or "npm run db:seed" first)`);
  if (!apply) {
    const dir = mkdtempSync(join(tmpdir(), 'tunion-dryrun-'));
    const copy = join(dir, 'copy.db');
    const source = new DatabaseSync(dbPath, { readOnly: true });
    try {
      source.exec(`VACUUM INTO '${copy.replace(/'/g, "''")}'`);
    } finally {
      source.close();
    }
    const db = openDatabase(copy);
    try {
      return { value: fn(db) };
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const backupDir = join(dirname(dbPath), 'backups');
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(backupDir, `${basename(dbPath, '.db')}-${stamp}.db`);
  const source = new DatabaseSync(dbPath, { readOnly: true });
  try {
    source.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  } finally {
    source.close();
  }
  const db = openDatabase(dbPath);
  try {
    return { value: fn(db), backupPath };
  } finally {
    db.close();
  }
}
