import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../db';
import { parseCsv } from './csv';
import { courseLevel, normalizeCourseCode, runImport, unhideAll } from './importer';
import { withTarget } from './target';

// Synthetic data only: never real students or emails.
const COURSES = `code,name,description
CIS 1001,Intro,"Welcome, everyone"
CIS 2168,Data Structures,Lists and trees
CIS 3207,Operating Systems,Processes, threads, and memory (unquoted commas)
`;
const USERS = `name,email,account_type,tutor_badge,current_courses,previous_courses
Ann,ann@example.edu,Student,Yes,CIS 2168,"CIS 1001, CIS 3207"
Bob,bob@example.edu,Student,No,"CIS 1001, CIS 2168",
`;

type Row = Record<string, unknown>;
let dir: string;
let path: string;
let db: DatabaseSync;
const one = (sql: string, ...p: (string | number)[]) => db.prepare(sql).get(...p) as Row;
const all = (sql: string, ...p: (string | number)[]) => db.prepare(sql).all(...p) as Row[];
const snapshot = () => JSON.stringify(['users', 'courses', 'enrollments', 'tutors', 'tutor_courses', 'discussions'].map((t) => all(`SELECT * FROM ${t}`)));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tunion-import-'));
  path = join(dir, 'test.db');
  db = openDatabase(path);
  db.exec(`
    INSERT INTO users (id,name,email,role) VALUES (1,'Demo Student','demo@demo.tunion.edu','student'),(2,'Demo Tutor','tutor@demo.tunion.edu','tutor'),(3,'Admin','admin@demo.tunion.edu','admin'),(9,'Old Ann','ANN@Example.edu','tutor');
    INSERT INTO courses (id,code,title,level) VALUES (1,'CS101','Demo Course',100),(2,'cis 1001','Old Intro Title',100);
    INSERT INTO tutors (id,user_id) VALUES (1,2),(2,9);
    INSERT INTO enrollments (user_id,course_id) VALUES (1,1),(9,1);
    INSERT INTO discussions (id,course_id,author_id,title,body) VALUES (1,1,1,'Demo post','body'),(2,1,9,'Old Ann post','body');
  `);
});
afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

describe('csv parsing and normalization', () => {
  it('handles BOM, CRLF, quotes, escaped quotes and embedded newlines', () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n"multi\nline",z\r\n');
    assert.deepEqual(rows, [['a', 'b'], ['x, y', 'say "hi"'], ['multi\nline', 'z']]);
  });
  it('treats the first commas as separators and keeps every later comma inside the last column', async () => {
    const { parseCsvObjects } = await import('./csv');
    const r = parseCsvObjects('code,name,description\nCIS 1,Name,One, two, and three.\nCIS 2,"Quoted, name","Quoted, description"\n', ['code', 'name', 'description'], { rejoinLastColumn: true });
    assert.deepEqual(r.errors, []);
    assert.equal(r.rows[0].description, 'One, two, and three.');
    assert.equal(r.rows[1].name, 'Quoted, name');
    assert.equal(r.warnings.length, 1); // only the unquoted row is flagged
  });
  it('normalizes course codes and derives levels', () => {
    assert.equal(normalizeCourseCode(' cis1001 '), 'CIS 1001');
    assert.equal(normalizeCourseCode('CIS  2168'), 'CIS 2168');
    assert.equal(normalizeCourseCode('not a code'), null);
    assert.equal(courseLevel('CIS 1001'), 100);
    assert.equal(courseLevel('CIS 4398'), 400);
    assert.equal(courseLevel('CS 310'), 300);
  });
});

describe('validation', () => {
  it('writes nothing when a referenced course is unknown, and reports every problem', () => {
    const before = snapshot();
    const bad = USERS + 'Cy,cy@example.edu,Student,No,CIS 9999,CIS 1001\nAnn,ann@example.edu,Student,No,,\n';
    const r = runImport(db, { coursesCsv: COURSES, usersCsv: bad }, { apply: true });
    assert.ok(r.errors.some((e) => e.includes('unknown course CIS 9999')));
    assert.ok(r.errors.some((e) => e.includes('duplicate email')));
    assert.equal(snapshot(), before);
  });
  it('rejects bad emails, duplicate course codes and missing columns', () => {
    const r = runImport(db, { coursesCsv: 'code,name\nCIS 1001,A\n', usersCsv: 'name,email\nX,nope\n' }, { apply: true });
    assert.ok(r.errors.some((e) => e.includes('Missing column')));
    const dup = runImport(db, { coursesCsv: 'code,name,description\nCIS 1001,A,\nCIS1001,B,\n', usersCsv: USERS.split('\n')[0] + '\n' }, { apply: true });
    assert.ok(dup.errors.some((e) => e.includes('duplicate course code')));
  });
  it('refuses to create a new admin, but accepts an existing admin row', () => {
    const header = USERS.split('\n')[0];
    const created = runImport(db, { coursesCsv: COURSES, usersCsv: `${header}\nNew,new@example.edu,Admin,No,,\n` }, { apply: true });
    assert.ok(created.errors.some((e) => e.includes('new admin')));
    const existing = runImport(db, { coursesCsv: COURSES, usersCsv: `${header}\nAdmin,admin@demo.tunion.edu,Admin,No,,\n` }, { apply: true });
    assert.deepEqual(existing.errors, []);
    assert.equal(one('SELECT role FROM users WHERE id = 3').role, 'admin');
  });
  it('warns on overlapping current/previous and unknown account types', () => {
    const csv = `${USERS.split('\n')[0]}\nDee,dee@example.edu,Tutor,No,CIS 1001,CIS 1001\n`;
    const r = runImport(db, { coursesCsv: COURSES, usersCsv: csv }, { apply: true });
    assert.deepEqual(r.errors, []);
    assert.ok(r.warnings.some((w) => w.includes('both current and previous')));
    assert.equal(one("SELECT role FROM users WHERE email = 'dee@example.edu'").role, 'student');
    assert.ok(one("SELECT 1 x FROM tutors WHERE user_id = (SELECT id FROM users WHERE email = 'dee@example.edu')"));
  });
});

describe('import behaviour', () => {
  it('imports courses, students, tutor badges and current/previous enrollments', () => {
    const r = runImport(db, { coursesCsv: COURSES, usersCsv: USERS }, { apply: true });
    assert.deepEqual(r.errors, []);
    assert.ok(r.warnings.some((w) => w.includes('extra comma')));
    assert.equal(one("SELECT description d FROM courses WHERE code = 'CIS 3207'").d, 'Processes, threads, and memory (unquoted commas)');
    const bob = one("SELECT id, role FROM users WHERE email = 'bob@example.edu'");
    assert.equal(bob.role, 'student');
    assert.equal(one('SELECT COUNT(*) n FROM tutors WHERE user_id = ?', bob.id as number).n, 0);
    const ann = one("SELECT id FROM users WHERE lower(email) = 'ann@example.edu'");
    const status = (uid: number, code: string) =>
      one('SELECT e.status s FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.user_id = ? AND c.code = ?', uid, code)?.s;
    assert.equal(status(ann.id as number, 'CIS 2168'), 'current');
    assert.equal(status(ann.id as number, 'CIS 1001'), 'completed');
    assert.equal(status(ann.id as number, 'CIS 3207'), 'completed');
    // A tutor may tutor the courses they have already completed.
    const tcodes = all('SELECT c.code FROM tutor_courses tc JOIN tutors t ON t.id = tc.tutor_id JOIN courses c ON c.id = tc.course_id WHERE t.user_id = ?', ann.id as number).map((x) => x.code);
    assert.deepEqual(tcodes.sort(), ['CIS 1001', 'CIS 3207']);
  });

  it('matches by normalized code / case-insensitive email, preserving primary keys', () => {
    runImport(db, { coursesCsv: COURSES, usersCsv: USERS }, { apply: true });
    const course = one("SELECT id, code, title FROM courses WHERE title = 'Intro'");
    assert.equal(course.id, 2); // legacy 'cis 1001' row updated in place
    assert.equal(course.code, 'CIS 1001');
    const ann = one("SELECT id, name, role FROM users WHERE lower(email) = 'ann@example.edu'");
    assert.equal(ann.id, 9);
    assert.equal(ann.name, 'Ann');
    assert.equal(ann.role, 'student'); // tutor is a badge, not a role
    assert.equal(one('SELECT COUNT(*) n FROM users').n, 5); // 4 existing + Bob
    assert.equal(one('SELECT COUNT(*) n FROM tutors WHERE user_id = 9').n, 1); // existing tutor row reused
  });

  it('preserves the admin and never reassigns or deletes legacy content', () => {
    const before = all('SELECT id, author_id, course_id FROM discussions');
    runImport(db, { coursesCsv: COURSES, usersCsv: USERS }, { apply: true });
    assert.deepEqual(all('SELECT id, author_id, course_id FROM discussions'), before);
    assert.deepEqual({ ...one('SELECT name, role, is_hidden FROM users WHERE id = 3') }, { name: 'Admin', role: 'admin', is_hidden: 0 });
    assert.equal(one('SELECT COUNT(*) n FROM courses WHERE id = 1').n, 1);
    assert.equal(one('SELECT COUNT(*) n FROM enrollments WHERE user_id = 1').n, 1);
  });

  it('is idempotent: a repeat import changes nothing', () => {
    runImport(db, { coursesCsv: COURSES, usersCsv: USERS }, { apply: true });
    const first = snapshot();
    const r = runImport(db, { coursesCsv: COURSES, usersCsv: USERS }, { apply: true });
    assert.equal(snapshot(), first);
    assert.deepEqual([r.courses.added, r.courses.updated, r.users.added, r.users.updated, r.tutorBadges.added], [[], [], [], [], []]);
    assert.deepEqual(r.enrollments, { added: 0, changed: 0, unchanged: 5, keptNotInCsv: 1 });
  });

  it('re-labels an enrollment when the CSV changes it, and keeps enrollments missing from the CSV', () => {
    runImport(db, { coursesCsv: COURSES, usersCsv: USERS }, { apply: true });
    const moved = USERS.replace('Ann,ann@example.edu,Student,Yes,CIS 2168,"CIS 1001, CIS 3207"', 'Ann,ann@example.edu,Student,Yes,"CIS 2168, CIS 3207",CIS 1001');
    const r = runImport(db, { coursesCsv: COURSES, usersCsv: moved }, { apply: true });
    assert.equal(r.enrollments.changed, 1);
    assert.equal(one('SELECT COUNT(*) n FROM enrollments WHERE user_id = 9').n, 4); // CS101 kept
  });

  it('reports legacy records with their activity, and hides them only on request', () => {
    const r = runImport(db, { coursesCsv: COURSES, usersCsv: USERS }, { apply: true });
    assert.deepEqual(r.legacyUsers.map((u) => u.id), [1, 2]); // admin and CSV users excluded
    assert.ok(r.legacyUsers[0].activity.includes('1 discussions'));
    assert.deepEqual(r.legacyCourses.map((c) => c.id), [1]);
    assert.equal(one('SELECT COUNT(*) n FROM users WHERE is_hidden = 1').n, 0);

    runImport(db, { coursesCsv: COURSES, usersCsv: USERS }, { apply: true, hideLegacy: true });
    assert.deepEqual(all('SELECT id FROM users WHERE is_hidden = 1 ORDER BY id').map((u) => u.id), [1, 2]);
    assert.deepEqual(all('SELECT id FROM courses WHERE is_hidden = 1').map((c) => c.id), [1]);
    assert.equal(one('SELECT is_hidden h FROM users WHERE id = 3').h, 0);
    assert.deepEqual(unhideAll(db), { users: 2, courses: 1 });
    assert.equal(one('SELECT COUNT(*) n FROM users WHERE is_hidden = 1').n, 0);
  });
});

describe('dry run, backup and rollback', () => {
  it('dry run (in-process) writes nothing', () => {
    const before = snapshot();
    const r = runImport(db, { coursesCsv: COURSES, usersCsv: USERS }, { apply: false, hideLegacy: true });
    assert.equal(r.users.added.length, 1);
    assert.equal(snapshot(), before);
    assert.equal(one('SELECT COUNT(*) n FROM users WHERE is_hidden = 1').n, 0);
  });

  it('withTarget dry run leaves the real file untouched, even for an un-migrated database', () => {
    db.close();
    
    const old = new DatabaseSync(join(dir, 'old.db'));
    old.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL, major TEXT NOT NULL DEFAULT 'CS', year INTEGER NOT NULL DEFAULT 1, bio TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO users (id,name,email,role) VALUES (1,'A','a@demo.tunion.edu','admin');`);
    old.close();
    const r = withTarget(join(dir, 'old.db'), false, (d) => runImport(d, { coursesCsv: COURSES, usersCsv: USERS }, { apply: false }));
    assert.deepEqual(r.value.errors, []);
    const check = new DatabaseSync(join(dir, 'old.db'), { readOnly: true });
    assert.equal((check.prepare('SELECT COUNT(*) n FROM users').get() as Row).n, 1);
    assert.equal(check.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = 'is_hidden'").get(), undefined);
    check.close();
    assert.equal(readdirSync(dir).includes('backups'), false);
    db = openDatabase(path); // for afterEach
  });

  it('withTarget apply backs up first; the backup restores the pre-import state', () => {
    db.close();
    const r = withTarget(path, true, (d) => runImport(d, { coursesCsv: COURSES, usersCsv: USERS }, { apply: true }));
    assert.ok(r.backupPath && existsSync(r.backupPath));
    
    const backup = new DatabaseSync(r.backupPath!, { readOnly: true });
    assert.equal((backup.prepare('SELECT COUNT(*) n FROM users').get() as Row).n, 4);
    backup.close();
    db = openDatabase(path);
    assert.equal(one('SELECT COUNT(*) n FROM users').n, 5);
  });

  it('refuses to create a database that does not exist', () => {
    assert.throws(() => withTarget(join(dir, 'missing.db'), false, () => 0), /Database not found/);
    assert.equal(existsSync(join(dir, 'missing.db')), false);
  });
});
