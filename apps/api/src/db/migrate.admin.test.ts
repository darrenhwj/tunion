import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, renameLegacyAdmin } from './index';

describe('renaming the legacy admin', () => {
  it('renames only the admin, keeps id/email/role, and is idempotent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tunion-rename-'));
    const db = openDatabase(join(dir, 't.db'));
    db.exec(`INSERT INTO users (id,name,email,role) VALUES
      (6,'Dana Whitfield','admin@example.edu','admin'),
      (7,'Dana Whitfield','student@example.edu','student'),
      (8,'Someone Else','other@example.edu','student');
      INSERT INTO discussions (id,course_id,author_id,title,body) SELECT 1, 1, 6, 'Admin post', 'x' WHERE 0;`);
    const before = JSON.stringify(db.prepare('SELECT * FROM users ORDER BY id').all());
    renameLegacyAdmin(db);
    const rows = db.prepare('SELECT id,name,email,role FROM users ORDER BY id').all() as Record<string, unknown>[];
    assert.deepEqual({ ...rows[0] }, { id: 6, name: 'Hani Karam', email: 'admin@example.edu', role: 'admin' });
    assert.equal(rows[1].name, 'Dana Whitfield'); // a non-admin with the same name is not touched
    assert.equal(rows[2].name, 'Someone Else');
    const after = JSON.stringify(db.prepare('SELECT * FROM users ORDER BY id').all());
    renameLegacyAdmin(db);
    renameLegacyAdmin(db);
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM users ORDER BY id').all()), after);
    assert.notEqual(before, after);
    assert.equal((db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin'").get() as { n: number }).n, 1);
    // A manually chosen admin name is never overwritten.
    db.prepare("UPDATE users SET name = 'Custom Name' WHERE id = 6").run();
    renameLegacyAdmin(db);
    assert.equal((db.prepare('SELECT name FROM users WHERE id = 6').get() as { name: string }).name, 'Custom Name');
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('runs automatically when an old database is opened', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tunion-rename-'));
    const path = join(dir, 'old.db');
    const first = openDatabase(path);
    first.exec("INSERT INTO users (id,name,email,role) VALUES (1,'Dana Whitfield','a@example.edu','admin')");
    first.close();
    const reopened = openDatabase(path);
    assert.equal((reopened.prepare('SELECT name FROM users WHERE id = 1').get() as { name: string }).name, 'Hani Karam');
    reopened.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
