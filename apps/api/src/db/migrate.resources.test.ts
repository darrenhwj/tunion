import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

describe('migrating a database created before resource files and one-time sessions', () => {
  it('keeps existing resources and adds file columns, votes and one-time tables', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tunion-migrate-res-'));
    const path = join(dir, 'old.db');
    const old = new DatabaseSync(path);
    old.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL, major TEXT NOT NULL DEFAULT 'CS', year INTEGER NOT NULL DEFAULT 1, bio TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE courses (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', level INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE resources (
        id INTEGER PRIMARY KEY, course_id INTEGER NOT NULL REFERENCES courses(id), author_id INTEGER NOT NULL REFERENCES users(id),
        title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL CHECK (type IN ('notes','link','cheatsheet','practice','other')), url TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO users (id,name,email,role) VALUES (1,'S','s@x','student');
      INSERT INTO courses (id,code,title,level) VALUES (1,'CS101','Intro',100);
      INSERT INTO resources (id,course_id,author_id,title,type,url) VALUES (9,1,1,'Legacy link','link','https://example.edu');
    `);
    old.close();

    process.env.DATABASE_PATH = path;
    const { getDb, closeDb } = await import('./index');
    const db = getDb();
    const row = db.prepare('SELECT * FROM resources WHERE id = 9').get() as Record<string, unknown>;
    assert.equal(row.title, 'Legacy link');
    assert.equal(row.url, 'https://example.edu');
    assert.equal(row.stored_name, null);
    db.prepare("UPDATE resources SET stored_name = 'x.pdf', original_filename = 'x.pdf', mime_type = 'application/pdf', size_bytes = 5 WHERE id = 9").run();
    for (const t of ['resource_votes', 'one_time_sessions', 'one_time_session_participants']) {
      assert.ok(db.prepare('SELECT 1 FROM sqlite_master WHERE name = ?').get(t), `${t} should exist`);
    }
    db.prepare('INSERT INTO resource_votes (resource_id, user_id) VALUES (9, 1)').run();
    assert.throws(() => db.prepare('INSERT INTO resource_votes (resource_id, user_id) VALUES (9, 1)').run());
    closeDb();
    getDb(); // re-running the migration on an already-upgraded DB is a no-op
    closeDb();
    rmSync(dir, { recursive: true, force: true });
  });
});
