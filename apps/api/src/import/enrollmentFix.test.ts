import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../db';
import { swapCsvColumns, swapEnrollments } from './enrollmentFix';
import { runImport } from './importer';

// Synthetic data only. "Reversed" rows have intro courses as current and advanced ones as previous.
const COURSES = `code,name,description
CIS 1001,Intro,x
CIS 2168,Data Structures,x
CIS 3207,Systems,x
CIS 4398,Capstone,x
`;
const USERS = `name,email,account_type,tutor_badge,current_courses,previous_courses
Tutor Ok,tutor.ok@example.edu,Student,Yes,CIS 4398,"CIS 1001, CIS 2168"
Plain Reversed,plain.rev@example.edu,Student,No,CIS 1001,"CIS 2168, CIS 3207"
Tutor Reversed,tutor.rev@example.edu,Student,Yes,"CIS 1001, CIS 2168",CIS 3207
Plain Ok,plain.ok@example.edu,Student,No,"CIS 3207, CIS 2168",CIS 1001
`;

let dir: string;
let db: DatabaseSync;
const state = (email: string) => Object.fromEntries(
  (db.prepare(`SELECT c.code, e.status FROM enrollments e JOIN courses c ON c.id = e.course_id JOIN users u ON u.id = e.user_id WHERE lower(u.email) = ? ORDER BY c.code`).all(email) as { code: string; status: string }[])
    .map((r) => [r.code, r.status]));
const everything = () => JSON.stringify(['users', 'courses', 'tutors', 'tutor_courses', 'enrollments'].map((t) => db.prepare(`SELECT * FROM ${t} ORDER BY 1, 2`).all()));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tunion-swap-'));
  db = openDatabase(join(dir, 't.db'));
  assert.deepEqual(runImport(db, { coursesCsv: COURSES, usersCsv: USERS }, { apply: true }).errors, []);
});
afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

describe('enrollment classification', () => {
  it('imports current/previous identically whether or not the student has a Tutor badge', () => {
    // Same course in the same column gets the same status for a tutor and a non-tutor.
    assert.equal(state('tutor.rev@example.edu')['CIS 1001'], 'current');
    assert.equal(state('plain.rev@example.edu')['CIS 1001'], 'current');
    assert.equal(state('tutor.ok@example.edu')['CIS 1001'], 'completed');
    assert.equal(state('plain.ok@example.edu')['CIS 1001'], 'completed');
    // Flipping only the badge in the CSV must not change any enrollment status.
    const before = JSON.stringify(db.prepare('SELECT user_id, course_id, status FROM enrollments ORDER BY 1, 2').all());
    const flipped = USERS.replace(',Yes,', ',No,').replace(',No,CIS 1001,"CIS 2168', ',Yes,CIS 1001,"CIS 2168');
    runImport(db, { coursesCsv: COURSES, usersCsv: flipped }, { apply: true });
    assert.equal(JSON.stringify(db.prepare('SELECT user_id, course_id, status FROM enrollments ORDER BY 1, 2').all()), before);
  });
});

describe('swapEnrollments', () => {
  const targets = ['plain.rev@example.edu', 'tutor.rev@example.edu'];

  it('dry run reports but changes nothing', () => {
    const before = everything();
    const r = swapEnrollments(db, USERS, targets, { apply: false });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.users.map((u) => u.outcome), ['swapped', 'swapped']);
    assert.equal(everything(), before);
  });

  it('swaps only the listed students, only enrollment statuses, whatever their badge', () => {
    const others = { a: state('tutor.ok@example.edu'), b: state('plain.ok@example.edu') };
    const before = JSON.parse(everything()) as unknown[][];
    const r = swapEnrollments(db, USERS, targets, { apply: true });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(state('plain.rev@example.edu'), { 'CIS 1001': 'completed', 'CIS 2168': 'current', 'CIS 3207': 'current' });
    assert.deepEqual(state('tutor.rev@example.edu'), { 'CIS 1001': 'completed', 'CIS 2168': 'completed', 'CIS 3207': 'current' });
    assert.deepEqual({ a: state('tutor.ok@example.edu'), b: state('plain.ok@example.edu') }, others);
    const after = JSON.parse(everything()) as unknown[][];
    // users, courses, tutors, tutor_courses are byte-for-byte unchanged; only the enrollments table differs.
    assert.deepEqual(after.slice(0, 4), before.slice(0, 4));
    assert.equal(after[4].length, before[4].length);
  });

  it('refuses a second run instead of swapping back, and reports already-corrected', () => {
    swapEnrollments(db, USERS, targets, { apply: true });
    const snapshot = everything();
    const again = swapEnrollments(db, USERS, targets, { apply: true });
    assert.deepEqual(again.users.map((u) => u.outcome), ['already-corrected', 'already-corrected']);
    assert.equal(everything(), snapshot);
  });

  it('refuses (and changes nothing) when a student no longer matches the CSV or is unknown', () => {
    db.prepare("UPDATE enrollments SET status = 'completed' WHERE user_id = (SELECT id FROM users WHERE email = 'plain.rev@example.edu') AND course_id = (SELECT id FROM courses WHERE code = 'CIS 1001')").run();
    const before = everything();
    const edited = swapEnrollments(db, USERS, targets, { apply: true });
    assert.ok(edited.users.some((u) => u.outcome === 'refused'));
    assert.equal(everything(), before);
    assert.ok(swapEnrollments(db, USERS, ['nobody@example.edu'], { apply: true }).errors.length > 0);
    assert.ok(swapEnrollments(db, USERS, [], { apply: true }).errors.length > 0);
  });

  it('writes a corrected CSV for the same rows only, so a re-import keeps the fix', () => {
    swapEnrollments(db, USERS, targets, { apply: true });
    const corrected = swapCsvColumns(USERS, targets);
    assert.ok(corrected.includes('Plain Ok,plain.ok@example.edu,Student,No,"CIS 3207, CIS 2168",CIS 1001'));
    const snapshot = everything();
    const re = runImport(db, { coursesCsv: COURSES, usersCsv: corrected }, { apply: true });
    assert.deepEqual(re.errors, []);
    assert.equal(everything(), snapshot);
    // Re-importing the ORIGINAL CSV would restore the wrong classification: that is why the corrected CSV matters.
    runImport(db, { coursesCsv: COURSES, usersCsv: USERS }, { apply: true });
    assert.equal(state('plain.rev@example.edu')['CIS 1001'], 'current');
  });
});
