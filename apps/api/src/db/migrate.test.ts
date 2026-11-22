import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

describe('migrating a database created before tutoring sessions existed', () => {
  it('keeps old tutoring requests and adds the new statuses and tables', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tunion-migrate-'));
    const path = join(dir, 'old.db');
    // The previous version of the relevant schema (status CHECK without 'confirmed'/'rejected').
    const old = new DatabaseSync(path);
    old.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL, major TEXT NOT NULL DEFAULT 'CS', year INTEGER NOT NULL DEFAULT 1, bio TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE courses (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', level INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE tutors (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id), headline TEXT NOT NULL DEFAULT '', availability TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE tutoring_requests (
        id INTEGER PRIMARY KEY, course_id INTEGER NOT NULL REFERENCES courses(id), student_id INTEGER NOT NULL REFERENCES users(id),
        tutor_id INTEGER REFERENCES tutors(id), topic TEXT NOT NULL, details TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','completed','cancelled')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO users (id,name,email,role) VALUES (1,'S','s@x','student'),(2,'T','t@x','tutor');
      INSERT INTO courses (id,code,title,level) VALUES (1,'CS101','Intro',100);
      INSERT INTO tutors (id,user_id) VALUES (1,2);
      INSERT INTO tutoring_requests (id,course_id,student_id,tutor_id,topic,status) VALUES (7,1,1,1,'Legacy topic','accepted');
    `);
    old.close();

    process.env.DATABASE_PATH = path;
    const { getDb, closeDb } = await import('./index');
    const db = getDb(); // runs the migration
    const row = db.prepare('SELECT * FROM tutoring_requests WHERE id = 7').get() as Record<string, unknown>;
    assert.equal(row.topic, 'Legacy topic');
    assert.equal(row.status, 'accepted');
    assert.equal(row.proposed_starts_at, null);
    db.prepare("UPDATE tutoring_requests SET status = 'rejected' WHERE id = 7").run(); // new status now allowed
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'tutoring_sessions'").get());
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'tutor_availability_slots'").get());
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'tutoring_requests_legacy'").get(), undefined);
    assert.equal((db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys, 1);
    closeDb();
    closeDb();
    rmSync(dir, { recursive: true, force: true });
  });
});
