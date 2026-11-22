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
CIS 3207,Operating Systems,"Processes, threads, and memory"
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
const snapshot = () => JSON.stringify(['users', 'courses', 'enrollments', 'tutors', 'tutor_courses', 'discussions', 'resources', 'tutoring_requests', 'tutoring_sessions'].map((t) => all(`SELECT * FROM ${t}`)));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tunion-import-'));
  path = join(dir, 'test.db');
  db = openDatabase(path);
  db.exec(`
    INSERT INTO users (id,name,email,role,major,year) VALUES (1,'Demo Student','demo@demo.tunion.edu','student','Computer Science',1),(2,'Demo Tutor','tutor@demo.tunion.edu','tutor','Computer Science',2),(3,'Admin','admin@demo.tunion.edu','admin','Computer Science',4),(9,'Old Ann','ANN@Example.edu','tutor','Computer Science',3);
    INSERT INTO courses (id,code,title,level) VALUES (1,'CS101','Demo Course',100),(2,'cis 1001','Old Intro Title',100);
    INSERT INTO tutors (id,user_id) VALUES (1,2),(2,9);
    INSERT INTO tutor_courses (tutor_id,course_id) VALUES (2,1);
    INSERT INTO enrollments (user_id,course_id) VALUES (1,1),(9,1);
    INSERT INTO discussions (id,course_id,author_id,title,body) VALUES (1,1,1,'Demo post','body'),(2,1,9,'Old Ann post','body');
    INSERT INTO resources (id,course_id,author_id,title,type) VALUES (1,1,9,'Old Ann notes','notes');
    INSERT INTO tutoring_requests (id,course_id,student_id,tutor_id,topic,status) VALUES (1,1,1,2,'Old topic','open');
    INSERT INTO tutoring_sessions (id,course_id,tutor_id,student_id,starts_at,ends_at,location_type,status) VALUES (1,1,2,1,'2026-01-01T01:00:00Z','2026-01-01T02:00:00Z','online','scheduled'),(2,1,2,1,'2025-01-01T01:00:00Z','2025-01-01T02:00:00Z','online','completed');
  `);
});
afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

describe('csv parsing and normalization', () => {
  it('handles BOM, CRLF, quotes, escaped quotes and embedded newlines', () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n"multi\nline",z\r\n');
    assert.deepEqual(rows, [['a', 'b'], ['x, y', 'say "hi"'], ['multi\nline', 'z']]);
  });
  it('rejects a record with an unquoted comma instead of re-assembling it', async () => {
    const { parseCsvObjects } = await import('./csv');
    const r = parseCsvObjects('code,name,description\nCIS 1,Name,One, two, and three.\nCIS 2,"Quoted, name","Quoted, description"\n', ['code', 'name', 'description']);
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0], /Row 2 \(starts with "CIS 1"\): expected 3 columns, found 5/);
    assert.equal(r.rows.length, 1); // only the well-formed record survives, with its original row number
    assert.equal(r.rows[0].row, 3);
    assert.equal(r.rows[0].v.name, 'Quoted, name');
    assert.equal(r.rows[0].v.description, 'Quoted, description');
  });
  it('rejects short records and malformed quoting', async () => {
    const { parseCsvObjects } = await import('./csv');
    assert.match(parseCsvObjects('a,b,c\n1,2\n', ['a']).errors[0], /expected 3 columns, found 2/);
    assert.throws(() => parseCsv('a,b\nx"y,z\n'), /line 2.*quote inside an unquoted field/);
    assert.throws(() => parseCsv('a,b\n"x"y,z\n'), /line 2.*after the closing quote/);
    assert.throws(() => parseCsv('a,b\n"open,z\n'), /unterminated/);
    assert.match(parseCsvObjects('a,b\n"open,z\n', ['a']).errors[0], /Malformed CSV/);
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
  it('rejects an unquoted CIS 3207 description, writes nothing, and flags it for verification', () => {
    const before = snapshot();
    const bad = COURSES.replace('"Processes, threads, and memory"', 'Processes, threads, and memory');
    const r = runImport(db, { coursesCsv: bad, usersCsv: USERS }, { apply: true });
    assert.ok(r.errors.some((e) => e.includes('courses.csv') && e.includes('CIS 3207') && e.includes('expected 3 columns, found 5')));
    assert.ok(r.needsVerification.some((v) => v.startsWith('CIS 3207')));
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
    assert.ok(r.warnings.some((w) => w.includes('Tutor') && w.includes('imported as Student')));
  });
});

describe('import behaviour', () => {
  it('imports courses, students, tutor badges and current/previous enrollments', () => {
    const r = runImport(db, { coursesCsv: COURSES, usersCsv: USERS }, { apply: true });
    assert.deepEqual(r.errors, []);
    assert.equal(one("SELECT description d FROM courses WHERE code = 'CIS 3207'").d, 'Processes, threads, and memory');
    assert.equal(one("SELECT description d FROM courses WHERE code = 'CIS 1001'").d, 'Welcome, everyone');
    assert.ok(r.needsVerification.some((v) => v.startsWith('CIS 3207'))); // flagged even when well-formed
    const bob = one("SELECT id, role FROM users WHERE email = 'bob@example.edu'");
    assert.equal(bob.role, 'student');
    assert.equal(one('SELECT COUNT(*) n FROM tutors WHERE user_id = ?', bob.id as number).n, 0);
    const ann = one("SELECT id FROM users WHERE lower(email) = 'ann@example.edu'");
    const status = (uid: number, code: string) =>
      one('SELECT e.status s FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.user_id = ? AND c.code = ?', uid, code)?.s;
    assert.equal(status(ann.id as number, 'CIS 2168'), 'current');
    assert.equal(status(ann.id as number, 'CIS 1001'), 'completed');
    assert.equal(status(ann.id as number, 'CIS 3207'), 'completed');
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
    assert.equal(one('SELECT id FROM tutors WHERE user_id = 9').id, 2);
  });

  it('preserves the admin and never reassigns or deletes legacy content', () => {
    const before = all('SELECT id, author_id, course_id FROM discussions');
    runImport(db, { coursesCsv: COURSES, usersCsv: USERS }, { apply: true });
    assert.deepEqual(all('SELECT id, author_id, course_id FROM discussions'), before);
    assert.deepEqual({ ...one('SELECT name, role, is_hidden FROM users WHERE id = 3') }, { name: 'Admin', role: 'admin', is_hidden: 0 });
    assert.equal(one('SELECT COUNT(*) n FROM courses WHERE id = 1').n, 1);
    assert.equal(one('SELECT COUNT(*) n FROM enrollments WHERE user_id = 1').n, 1); // not in the CSV: untouched
  });

  it('is idempotent: a repeat import changes nothing', () => {
    runImport(db, { coursesCsv: COURSES, usersCsv: USERS }, { apply: true });
    const first = snapshot();
    const r = runImport(db, { coursesCsv: COURSES, usersCsv: USERS }, { apply: true });
    assert.equal(snapshot(), first);
    assert.deepEqual([r.courses.added, r.courses.updated, r.users.added, r.users.updated, r.tutorBadges.granted, r.tutorBadges.revoked, r.enrollments.removed], [[], [], [], [], [], [], []]);
    assert.deepEqual([r.enrollments.added, r.enrollments.changed, r.enrollments.unchanged], [0, 0, 5]);
  });

  it('re-labels an enrollment when the CSV changes it', () => {
    runImport(db, { coursesCsv: COURSES, usersCsv: USERS }, { apply: true });
    const moved = USERS.replace('Ann,ann@example.edu,Student,Yes,CIS 2168,"CIS 1001, CIS 3207"', 'Ann,ann@example.edu,Student,Yes,"CIS 2168, CIS 3207",CIS 1001');
    const r = runImport(db, { coursesCsv: COURSES, usersCsv: moved }, { apply: true });
    assert.equal(r.enrollments.changed, 1);
    assert.equal(one('SELECT COUNT(*) n FROM enrollments WHERE user_id = 9').n, 3);
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

const HEADER = 'name,email,account_type,tutor_badge,current_courses,previous_courses,tutoring_subjects,year,major';
const run = (rows: string, apply = true, hideLegacy = false) =>
  runImport(db, { coursesCsv: COURSES, usersCsv: `${HEADER}\n${rows}\n` }, { apply, hideLegacy });

describe('tutoring subjects are explicit', () => {
  it('never derives subjects from completed courses; unspecified stays empty', () => {
    const r = run('Eve,eve@example.edu,Student,Yes,,"CIS 1001, CIS 3207",,,');
    assert.deepEqual(r.errors, []);
    const eve = one("SELECT id FROM users WHERE email = 'eve@example.edu'");
    assert.equal(one('SELECT COUNT(*) n FROM tutors WHERE user_id = ?', eve.id as number).n, 1);
    assert.equal(all('SELECT * FROM tutor_courses WHERE tutor_id = (SELECT id FROM tutors WHERE user_id = ?)', eve.id as number).length, 0);
    assert.ok(r.warnings.some((w) => w.includes('eve@example.edu') && w.includes('no tutoring_subjects')));
  });
  it('works without the optional columns at all', () => {
    const r = runImport(db, { coursesCsv: COURSES, usersCsv: USERS }, { apply: true });
    assert.deepEqual(r.errors, []);
    assert.equal(all('SELECT * FROM tutor_courses WHERE tutor_id = (SELECT id FROM tutors WHERE user_id = 9)').length, 1); // existing row untouched
  });
  it('sets exactly the listed subjects and reports additions and removals, in a dry run too', () => {
    run('Ann,ann@example.edu,Student,Yes,,"CIS 1001, CIS 3207","CIS 1001, CIS 2168",,');
    const subjects = () => all('SELECT c.code FROM tutor_courses tc JOIN courses c ON c.id = tc.course_id WHERE tc.tutor_id = 2').map((x) => x.code).sort();
    assert.deepEqual(subjects(), ['CIS 1001', 'CIS 2168']); // legacy CS101 replaced; CIS 3207 (completed) NOT added
    const before = snapshot();
    const dry = run('Ann,ann@example.edu,Student,Yes,,"CIS 1001, CIS 3207",CIS 3207,,', false);
    assert.deepEqual(dry.tutorSubjects.removed.sort(), ['ann@example.edu: CIS 1001', 'ann@example.edu: CIS 2168']);
    assert.deepEqual(dry.tutorSubjects.added, ['ann@example.edu: CIS 3207']);
    assert.equal(snapshot(), before);
  });
  it('rejects unknown subject codes and ignores subjects for a non-tutor', () => {
    assert.ok(run('Ann,ann@example.edu,Student,Yes,,,CIS 9999,,').errors.some((e) => e.includes('unknown course CIS 9999')));
    const r = run('Bo,bo@example.edu,Student,No,,,CIS 1001,,');
    assert.ok(r.warnings.some((w) => w.includes('tutoring_subjects ignored')));
    assert.equal(one("SELECT COUNT(*) n FROM tutors WHERE user_id = (SELECT id FROM users WHERE email = 'bo@example.edu')").n, 0);
  });
});

describe('year and major are never invented', () => {
  it('stores unspecified values as sentinels that the API reports as null', async () => {
    run('Fay,fay@example.edu,Student,No,,,,,');
    const row = one("SELECT * FROM users WHERE email = 'fay@example.edu'");
    assert.deepEqual([row.year, row.major], [0, '']);
    const { toUser } = await import('../mappers');
    const u = toUser(row);
    assert.deepEqual([u.year, u.major], [null, null]);
    assert.deepEqual([toUser(one('SELECT * FROM users WHERE id = 1')).year, toUser(one('SELECT * FROM users WHERE id = 1')).major], [1, 'Computer Science']);
  });
  it('stores specified values, validates year, and does not overwrite known values with blanks', () => {
    run('Gus,gus@example.edu,Student,No,,,,3,Mathematics');
    assert.deepEqual({ ...one("SELECT year, major FROM users WHERE email = 'gus@example.edu'") }, { year: 3, major: 'Mathematics' });
    assert.ok(run('Hal,hal@example.edu,Student,No,,,,first,').errors.some((e) => e.includes('year "first"')));
    assert.ok(run('Hal,hal@example.edu,Student,No,,,,0,').errors.some((e) => e.includes('year "0"')));
    run('Demo Student,demo@demo.tunion.edu,Student,No,,,,,'); // blank: keep the existing 1 / Computer Science
    assert.deepEqual({ ...one('SELECT year, major FROM users WHERE id = 1') }, { year: 1, major: 'Computer Science' });
    run('Demo Student,demo@demo.tunion.edu,Student,No,,,,2,Physics');
    assert.deepEqual({ ...one('SELECT year, major FROM users WHERE id = 1') }, { year: 2, major: 'Physics' });
  });
});

describe('enrollment updates', () => {
  it('syncs current/previous, removes stale links, reports removals, and keeps all activity', () => {
    const activity = () => JSON.stringify(['discussions', 'resources', 'tutoring_requests', 'tutoring_sessions', 'replies'].map((t) => all(`SELECT * FROM ${t}`)));
    const before = activity();
    const r = run('Ann,ann@example.edu,Student,Yes,CIS 2168,CIS 1001,,,');
    assert.deepEqual(r.enrollments.removed, [{ user: 'ann@example.edu', name: 'Ann', course: 'CS101', courseTitle: 'Demo Course', was: 'current' }]);
    assert.deepEqual(all('SELECT course_id FROM enrollments WHERE user_id = 9 ORDER BY course_id').map((e) => e.course_id), [2, 3]);
    assert.equal(activity(), before); // posts, resources, requests and sessions are untouched
    assert.equal(one('SELECT COUNT(*) n FROM enrollments WHERE user_id = 1').n, 1); // users not in the CSV are untouched
    // A later update moves a course from current to previous and drops another.
    const r2 = run('Ann,ann@example.edu,Student,Yes,,"CIS 2168, CIS 1001",,,');
    assert.equal(r2.enrollments.changed, 1);
    assert.equal(r2.enrollments.removed.length, 0);
    assert.equal(one('SELECT status s FROM enrollments WHERE user_id = 9 AND course_id = 3').s, 'completed');
    const r3 = run('Ann,ann@example.edu,Student,Yes,,CIS 1001,,,');
    assert.deepEqual(r3.enrollments.removed, [{ user: 'ann@example.edu', name: 'Ann', course: 'CIS 2168', courseTitle: 'Data Structures', was: 'completed' }]);
    assert.equal(activity(), before);
  });
  it('reports removals in a dry run without writing them', () => {
    const before = snapshot();
    const r = run('Ann,ann@example.edu,Student,Yes,CIS 2168,CIS 1001,,,', false);
    assert.equal(r.enrollments.removed.length, 1);
    assert.equal(snapshot(), before);
  });
  it('treats a user with both course cells blank as "no course data" and removes nothing', () => {
    const r = run('Ann,ann@example.edu,Student,Yes,,,,,');
    assert.equal(r.enrollments.removed.length, 0);
    assert.equal(r.enrollments.keptNoCourseData.length, 1);
    assert.equal(one('SELECT COUNT(*) n FROM enrollments WHERE user_id = 9').n, 1);
  });
});

describe('tutor badge Yes/No', () => {
  const tutorRow = (uid: number) => one('SELECT id, is_active FROM tutors WHERE user_id = ?', uid);
  it('No revokes (hides) but preserves the tutor row, subjects, requests and sessions', () => {
    const r = run('Ann,ann@example.edu,Student,No,,,,,');
    assert.deepEqual(r.errors, []);
    assert.equal(r.tutorBadges.revoked.length, 1);
    const rv = r.tutorBadges.revoked[0];
    assert.deepEqual(rv.openRequests, [{ id: 1, student: 'Demo Student', course: 'CS101', status: 'open' }]);
    assert.deepEqual(rv.scheduledSessions.map((x) => [x.id, x.student, x.course, x.upcoming]), [[1, 'Demo Student', 'CS101', false]]); // 2026-01-01 is in the past; the completed one is not listed
    assert.equal(tutorRow(9).is_active, 0);
    assert.equal(one('SELECT COUNT(*) n FROM tutor_courses WHERE tutor_id = 2').n, 1);
    assert.equal(one('SELECT COUNT(*) n FROM tutoring_sessions WHERE tutor_id = 2').n, 2);
    assert.equal(one('SELECT COUNT(*) n FROM tutoring_requests WHERE tutor_id = 2').n, 1);
    assert.equal(run('Ann,ann@example.edu,Student,No,,,,,').tutorBadges.revoked.length, 0); // idempotent
  });
  it('a later Yes re-activates the same tutor row', () => {
    run('Ann,ann@example.edu,Student,No,,,,,');
    const r = run('Ann,ann@example.edu,Student,Yes,,,,,');
    assert.deepEqual(r.tutorBadges.reactivated, ['ann@example.edu']);
    assert.deepEqual({ ...tutorRow(9) }, { id: 2, is_active: 1 });
    assert.equal(one('SELECT COUNT(*) n FROM tutors').n, 2);
  });
  it('blank leaves the badge as is, and anything other than Yes/No is an error', () => {
    const r = run('Ann,ann@example.edu,Student,,,,,,');
    assert.equal(tutorRow(9).is_active, 1);
    assert.ok(r.warnings.some((w) => w.includes('tutor_badge blank')));
    const bad = run('Ann,ann@example.edu,Student,Maybe,,,,,');
    assert.ok(bad.errors.some((e) => e.includes('must be Yes or No')));
    assert.equal(tutorRow(9).is_active, 1);
  });
  it('an explicit No beats account_type Tutor; blank + Tutor grants', () => {
    run('Ann,ann@example.edu,Tutor,No,,,,,');
    assert.equal(tutorRow(9).is_active, 0);
    run('Ann,ann@example.edu,Tutor,,,,,,');
    assert.equal(tutorRow(9).is_active, 1);
  });
  it('does not touch tutors who are not in the CSV, and a revoked tutor is reported in a dry run only', () => {
    const before = snapshot();
    const dry = run('Ann,ann@example.edu,Student,No,,,,,', false);
    assert.equal(dry.tutorBadges.revoked.length, 1);
    assert.equal(snapshot(), before);
    run('Ann,ann@example.edu,Student,No,,,,,');
    assert.equal(tutorRow(2).is_active, 1); // demo tutor, not in CSV
  });
});

describe('review concerns', () => {
  it('missing year/major never become Year 1 / Computer Science, even in a database whose columns still carry those defaults', () => {
    db.close();
    const old = new DatabaseSync(join(dir, 'legacy.db'));
    old.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL, major TEXT NOT NULL DEFAULT 'Computer Science', year INTEGER NOT NULL DEFAULT 1, bio TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO users (id,name,email,role,major,year) VALUES (1,'Admin','a@demo.tunion.edu','admin','Computer Science',4);`);
    old.close();
    const r = withTarget(join(dir, 'legacy.db'), true, (d) => {
      const rep = runImport(d, { coursesCsv: COURSES, usersCsv: `${HEADER}\nNew,new@example.edu,Student,No,,,,,\nKnown,known@example.edu,Student,No,,,,2,Biology\n` }, { apply: true });
      return { rep, rows: d.prepare('SELECT email, year, major FROM users ORDER BY id').all() as Row[] };
    });
    assert.deepEqual(r.value.rep.errors, []);
    assert.deepEqual(r.value.rows.map((x) => ({ ...x })), [
      { email: 'a@demo.tunion.edu', year: 4, major: 'Computer Science' }, // existing real data untouched
      { email: 'new@example.edu', year: 0, major: '' },
      { email: 'known@example.edu', year: 2, major: 'Biology' },
    ]);
    db = openDatabase(path);
  });

  it('flags duplicated descriptions across courses without inventing text', () => {
    const dup = 'code,name,description\nCIS 2168,Data Structures,"Lists, trees"\nCIS 3207,Operating Systems,"lists,  TREES"\n';
    const r = runImport(db, { coursesCsv: dup, usersCsv: `${HEADER}\n` }, { apply: false });
    assert.ok(r.needsVerification.some((v) => v.startsWith('CIS 2168, CIS 3207') && v.includes('identical description')));
    assert.ok(r.needsVerification.some((v) => v.startsWith('CIS 3207:')));
    assert.ok(!r.needsVerification.some((v) => v.includes('CIS 2168:')));
  });

  it('--hide-legacy hides only legacy demo users/courses, never CSV users, new users or admins', () => {
    const r = run('Ann,ann@example.edu,Student,Yes,CIS 2168,,,,\nBob,bob@example.edu,Student,No,,CIS 1001,,,', true, true);
    assert.deepEqual(r.legacyUsers.map((u) => u.id), [1, 2]);
    assert.deepEqual(all('SELECT id FROM users WHERE is_hidden = 1 ORDER BY id').map((u) => u.id), [1, 2]);
    assert.equal(one("SELECT is_hidden h FROM users WHERE email = 'bob@example.edu'").h, 0); // newly imported
    assert.equal(one('SELECT is_hidden h FROM users WHERE id = 9').h, 0); // matched existing account
    assert.equal(one('SELECT is_hidden h FROM users WHERE id = 3').h, 0); // admin
    assert.deepEqual(all('SELECT id FROM courses WHERE is_hidden = 1').map((c) => c.id), [1]); // CS101 only; imported courses stay visible
    // A hidden legacy account that appears in a later CSV is shown again.
    run('Demo Student,demo@demo.tunion.edu,Student,No,,,,,');
    assert.equal(one('SELECT is_hidden h FROM users WHERE id = 1').h, 0);
  });

  it('--hide-legacy is refused when users.csv is empty (it would hide every demo user)', () => {
    const r = runImport(db, { coursesCsv: COURSES, usersCsv: `${HEADER}\n` }, { apply: true, hideLegacy: true });
    assert.ok(r.errors.some((e) => e.includes('--hide-legacy refused')));
    assert.equal(one('SELECT COUNT(*) n FROM users WHERE is_hidden = 1').n, 0);
  });

  it('a dry run through withTarget names every enrollment to be removed, and writes nothing', () => {
    db.close();
    const before = new DatabaseSync(path, { readOnly: true }).prepare('SELECT COUNT(*) n FROM enrollments').get() as Row;
    const { value } = withTarget(path, false, (d) => runImport(d, { coursesCsv: COURSES, usersCsv: `${HEADER}\nAnn,ann@example.edu,Student,Yes,CIS 2168,CIS 1001,,,\n` }, { apply: false }));
    assert.deepEqual(value.enrollments.removed.map((x) => `${x.name} <${x.user}> ${x.course} ${x.courseTitle} ${x.was}`), ['Ann <ann@example.edu> CS101 Demo Course current']);
    const after = new DatabaseSync(path, { readOnly: true }).prepare('SELECT COUNT(*) n FROM enrollments').get() as Row;
    assert.equal(after.n, before.n);
    db = openDatabase(path);
  });
});

describe('backward-compatible migration', () => {
  it('adds tutors.is_active to an existing database, keeping tutors active and users\' real year/major', () => {
    db.close();
    const old = new DatabaseSync(join(dir, 'older.db'));
    old.exec(`PRAGMA foreign_keys = ON;
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL, major TEXT NOT NULL DEFAULT 'Computer Science', year INTEGER NOT NULL DEFAULT 1, bio TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE tutors (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id), headline TEXT NOT NULL DEFAULT '', availability TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO users (id,name,email,role) VALUES (1,'T','t@demo.tunion.edu','tutor');
      INSERT INTO tutors (id,user_id) VALUES (1,1);`);
    old.close();
    const migrated = openDatabase(join(dir, 'older.db'));
    assert.deepEqual({ ...(migrated.prepare('SELECT is_active FROM tutors').get() as Row) }, { is_active: 1 });
    assert.deepEqual({ ...(migrated.prepare('SELECT major, year FROM users').get() as Row) }, { major: 'Computer Science', year: 1 });
    migrated.close();
    db = openDatabase(path);
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
