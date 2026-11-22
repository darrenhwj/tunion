import type { DatabaseSync } from 'node:sqlite';
import { parseCsvObjects } from './csv';

export const COURSE_COLUMNS = ['code', 'name', 'description'] as const;
export const USER_COLUMNS = ['name', 'email', 'account_type', 'tutor_badge', 'current_courses', 'previous_courses'] as const;

export interface ImportInput { coursesCsv: string; usersCsv: string }

export interface LegacyRecord { id: number; label: string; activity: string }

export interface ImportReport {
  errors: string[];
  warnings: string[];
  courses: { added: string[]; updated: string[]; unchanged: string[] };
  users: { added: string[]; updated: string[]; unchanged: string[] };
  tutorBadges: { added: string[]; existingNotRemoved: string[] };
  enrollments: { added: number; changed: number; unchanged: number; keptNotInCsv: number };
  legacyUsers: LegacyRecord[];
  legacyCourses: LegacyRecord[];
}

interface CourseRow { code: string; title: string; description: string }
interface UserRow { name: string; email: string; admin: boolean; tutor: boolean; current: string[]; previous: string[] }

/** "cis1001", "CIS  1001" -> "CIS 1001". Returns null when not a course code. */
export function normalizeCourseCode(raw: string): string | null {
  const m = /^([A-Za-z]{2,6})\s*-?\s*(\d{3,4}[A-Za-z]?)$/.exec(raw.trim());
  return m ? `${m[1].toUpperCase()} ${m[2].toUpperCase()}` : null;
}

/** 1xxx -> 100 ... 4xxx -> 400; 3-digit codes use the hundreds digit. Clamped to the contract's 100..400. */
export function courseLevel(code: string): number {
  const num = Number(/\d+/.exec(code)![0]);
  const hundreds = num >= 1000 ? Math.floor(num / 1000) : Math.floor(num / 100);
  return Math.min(Math.max(hundreds, 1), 4) * 100;
}

export function normalizeEmail(raw: string): string { return raw.trim().toLowerCase(); }

function newReport(): ImportReport {
  return {
    errors: [], warnings: [],
    courses: { added: [], updated: [], unchanged: [] },
    users: { added: [], updated: [], unchanged: [] },
    tutorBadges: { added: [], existingNotRemoved: [] },
    enrollments: { added: 0, changed: 0, unchanged: 0, keptNotInCsv: 0 },
    legacyUsers: [], legacyCourses: [],
  };
}

function parseCourses(csv: string, report: ImportReport): CourseRow[] {
  const { rows, errors, warnings } = parseCsvObjects(csv, COURSE_COLUMNS, { rejoinLastColumn: true });
  report.errors.push(...errors.map((e) => `courses.csv: ${e}`));
  report.warnings.push(...warnings.map((w) => `courses.csv: ${w}`));
  const seen = new Set<string>();
  const out: CourseRow[] = [];
  rows.forEach((r, i) => {
    const line = `courses.csv row ${i + 2}`;
    const code = normalizeCourseCode(r.code ?? '');
    if (!code) return void report.errors.push(`${line}: invalid course code "${r.code}"`);
    if (!r.name) return void report.errors.push(`${line} (${code}): name is required`);
    if (seen.has(code)) return void report.errors.push(`${line}: duplicate course code ${code}`);
    seen.add(code);
    if (code.replace(/\D/g, '').length === 4 && Number(code.slice(-4)) >= 5000) report.warnings.push(`${code}: level above 400, stored as 400`);
    out.push({ code, title: r.name, description: r.description ?? '' });
  });
  return out;
}

function splitCodes(raw: string, who: string, field: string, known: Set<string>, report: ImportReport): string[] {
  const out: string[] = [];
  for (const part of raw.split(',').map((p) => p.trim()).filter(Boolean)) {
    const code = normalizeCourseCode(part);
    if (!code) report.errors.push(`${who}: ${field} has invalid course code "${part}"`);
    else if (!known.has(code)) report.errors.push(`${who}: ${field} references unknown course ${code}`);
    else if (out.includes(code)) report.warnings.push(`${who}: ${field} lists ${code} more than once`);
    else out.push(code);
  }
  return out;
}

function parseUsers(csv: string, known: Set<string>, existingAdmins: Set<string>, report: ImportReport): UserRow[] {
  const { rows, errors, warnings } = parseCsvObjects(csv, USER_COLUMNS);
  report.errors.push(...errors.map((e) => `users.csv: ${e}`));
  report.warnings.push(...warnings);
  const seen = new Set<string>();
  const out: UserRow[] = [];
  rows.forEach((r, i) => {
    const email = normalizeEmail(r.email ?? '');
    const who = `users.csv row ${i + 2} (${email || r.name || '?'})`;
    if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email)) return void report.errors.push(`${who}: invalid email`);
    if (!r.name) return void report.errors.push(`${who}: name is required`);
    if (seen.has(email)) return void report.errors.push(`${who}: duplicate email`);
    seen.add(email);

    const type = (r.account_type ?? '').toLowerCase();
    let admin = false;
    let tutor = false;
    if (type === 'admin') {
      if (!existingAdmins.has(email)) report.errors.push(`${who}: refusing to create a new admin account; only an existing admin may appear as Admin`);
      admin = true;
    } else if (type !== 'student') {
      report.warnings.push(`${who}: account_type "${r.account_type}" imported as Student${type === 'tutor' ? ' with tutor badge' : ''}`);
      tutor = type === 'tutor';
    }
    const badge = (r.tutor_badge ?? '').toLowerCase();
    if (badge === 'yes') tutor = true;
    else if (badge !== 'no') report.warnings.push(`${who}: tutor_badge "${r.tutor_badge}" is not Yes/No; treated as No`);

    const current = splitCodes(r.current_courses ?? '', who, 'current_courses', known, report);
    let previous = splitCodes(r.previous_courses ?? '', who, 'previous_courses', known, report);
    const both = previous.filter((c) => current.includes(c));
    if (both.length) {
      report.warnings.push(`${who}: ${both.join(', ')} listed as both current and previous; kept as current`);
      previous = previous.filter((c) => !current.includes(c));
    }
    out.push({ name: r.name, email, admin, tutor, current, previous });
  });
  return out;
}

type Row = Record<string, unknown>;

function legacyActivity(db: DatabaseSync, kind: 'user' | 'course', id: number): string {
  const count = (sql: string) => (db.prepare(sql).get(id) as { n: number }).n;
  const parts = kind === 'user'
    ? [
        [count('SELECT COUNT(*) n FROM discussions WHERE author_id = ?'), 'discussions'],
        [count('SELECT COUNT(*) n FROM replies WHERE author_id = ?'), 'replies'],
        [count('SELECT COUNT(*) n FROM resources WHERE author_id = ?'), 'resources'],
        [count('SELECT COUNT(*) n FROM tutoring_sessions WHERE tutor_id IN (SELECT id FROM tutors WHERE user_id = ?) OR student_id = ?1'), 'tutoring sessions'],
        [count('SELECT COUNT(*) n FROM study_group_members WHERE user_id = ?'), 'study groups'],
      ]
    : [
        [count('SELECT COUNT(*) n FROM discussions WHERE course_id = ?'), 'discussions'],
        [count('SELECT COUNT(*) n FROM resources WHERE course_id = ?'), 'resources'],
        [count('SELECT COUNT(*) n FROM study_groups WHERE course_id = ?'), 'study groups'],
        [count('SELECT COUNT(*) n FROM enrollments WHERE course_id = ?'), 'enrollments'],
      ];
  const shown = parts.filter(([n]) => (n as number) > 0).map(([n, l]) => `${n} ${l}`);
  return shown.length ? shown.join(', ') : 'no content';
}

/**
 * Validates the CSVs and, when valid, writes them inside ONE transaction. With `apply: false` the transaction is
 * always rolled back, so the report is exactly what `apply: true` would do. On any error nothing is written.
 * Existing primary keys are preserved; users/courses are never deleted; enrollments are only added or re-labelled.
 */
export function runImport(db: DatabaseSync, input: ImportInput, opts: { apply: boolean; hideLegacy?: boolean }): ImportReport {
  const report = newReport();
  const dbCourses = db.prepare('SELECT * FROM courses').all() as Row[];
  const dbUsers = db.prepare('SELECT * FROM users').all() as Row[];
  const courseByCode = new Map<string, Row>();
  for (const c of dbCourses) {
    const code = normalizeCourseCode(c.code as string);
    if (code) courseByCode.set(code, c);
  }
  const userByEmail = new Map(dbUsers.map((u) => [normalizeEmail(u.email as string), u]));
  const admins = new Set(dbUsers.filter((u) => u.role === 'admin').map((u) => normalizeEmail(u.email as string)));

  const courseRows = parseCourses(input.coursesCsv, report);
  const known = new Set([...courseByCode.keys(), ...courseRows.map((c) => c.code)]);
  const userRows = parseUsers(input.usersCsv, known, admins, report);
  if (report.errors.length) return report;

  db.exec('BEGIN IMMEDIATE');
  try {
    const courseId = new Map<string, number>();
    for (const c of courseRows) {
      const existing = courseByCode.get(c.code);
      if (!existing) {
        const r = db.prepare('INSERT INTO courses (code, title, description, level) VALUES (?,?,?,?)').run(c.code, c.title, c.description, courseLevel(c.code));
        courseId.set(c.code, Number(r.lastInsertRowid));
        report.courses.added.push(c.code);
        continue;
      }
      courseId.set(c.code, existing.id as number);
      const changed = existing.title !== c.title || existing.description !== c.description || existing.code !== c.code || existing.is_hidden === 1;
      if (changed) {
        db.prepare('UPDATE courses SET code = ?, title = ?, description = ?, is_hidden = 0 WHERE id = ?').run(c.code, c.title, c.description, existing.id as number);
        report.courses.updated.push(c.code);
      } else report.courses.unchanged.push(c.code);
    }
    for (const [code, row] of courseByCode) if (!courseId.has(code)) courseId.set(code, row.id as number);

    const csvEmails = new Set(userRows.map((u) => u.email));
    for (const u of userRows) {
      const existing = userByEmail.get(u.email);
      let userId: number;
      if (!existing) {
        const r = db.prepare("INSERT INTO users (name, email, role) VALUES (?,?,'student')").run(u.name, u.email);
        userId = Number(r.lastInsertRowid);
        report.users.added.push(u.email);
      } else {
        userId = existing.id as number;
        // Admins keep their role; any other matched account becomes a plain Student (tutor is a badge, not a role).
        const role = existing.role === 'admin' ? 'admin' : 'student';
        const changed = existing.name !== u.name || existing.role !== role || existing.is_hidden === 1;
        if (changed) {
          db.prepare('UPDATE users SET name = ?, role = ?, is_hidden = 0 WHERE id = ?').run(u.name, role, userId);
          report.users.updated.push(u.email);
        } else report.users.unchanged.push(u.email);
      }

      const tutorRow = db.prepare('SELECT id FROM tutors WHERE user_id = ?').get(userId) as { id: number } | undefined;
      let tutorId = tutorRow?.id;
      if (u.tutor && tutorId === undefined) {
        tutorId = Number(db.prepare("INSERT INTO tutors (user_id, headline, availability) VALUES (?, '', '')").run(userId).lastInsertRowid);
        report.tutorBadges.added.push(u.email);
      } else if (!u.tutor && tutorId !== undefined) report.tutorBadges.existingNotRemoved.push(u.email);
      // A tutor can tutor the courses they have already completed.
      if (u.tutor && tutorId !== undefined) {
        for (const code of u.previous) db.prepare('INSERT OR IGNORE INTO tutor_courses (tutor_id, course_id) VALUES (?,?)').run(tutorId, courseId.get(code)!);
      }

      const wanted = new Map<number, 'current' | 'completed'>();
      u.previous.forEach((c) => wanted.set(courseId.get(c)!, 'completed'));
      u.current.forEach((c) => wanted.set(courseId.get(c)!, 'current'));
      const have = new Map((db.prepare('SELECT course_id, status FROM enrollments WHERE user_id = ?').all(userId) as Row[]).map((e) => [e.course_id as number, e.status as string]));
      for (const [cid, status] of wanted) {
        const prev = have.get(cid);
        if (prev === undefined) {
          db.prepare('INSERT INTO enrollments (user_id, course_id, status) VALUES (?,?,?)').run(userId, cid, status);
          report.enrollments.added++;
        } else if (prev !== status) {
          db.prepare('UPDATE enrollments SET status = ? WHERE user_id = ? AND course_id = ?').run(status, userId, cid);
          report.enrollments.changed++;
        } else report.enrollments.unchanged++;
      }
      report.enrollments.keptNotInCsv += [...have.keys()].filter((cid) => !wanted.has(cid)).length;
    }

    // Legacy = everything not in the CSVs (admins excluded). Reported always; hidden only on request.
    const csvCourseCodes = new Set(courseRows.map((c) => c.code));
    for (const u of db.prepare("SELECT id, name, email, is_hidden FROM users WHERE role != 'admin' ORDER BY id").all() as Row[]) {
      if (csvEmails.has(normalizeEmail(u.email as string))) continue;
      report.legacyUsers.push({ id: u.id as number, label: `${u.name} <${u.email}>${u.is_hidden ? ' [hidden]' : ''}`, activity: legacyActivity(db, 'user', u.id as number) });
    }
    for (const c of db.prepare('SELECT id, code, title, is_hidden FROM courses ORDER BY id').all() as Row[]) {
      const code = normalizeCourseCode(c.code as string) ?? (c.code as string);
      if (csvCourseCodes.has(code)) continue;
      report.legacyCourses.push({ id: c.id as number, label: `${c.code} ${c.title}${c.is_hidden ? ' [hidden]' : ''}`, activity: legacyActivity(db, 'course', c.id as number) });
    }
    if (opts.hideLegacy) {
      setHidden(db, report.legacyUsers.map((r) => r.id), report.legacyCourses.map((r) => r.id), 1);
      report.warnings.push(`Hid ${report.legacyUsers.length} legacy user(s) and ${report.legacyCourses.length} legacy course(s) from the account selector / course directory`);
    }

    const fk = db.prepare('PRAGMA foreign_key_check').all();
    if (fk.length) throw new Error(`Foreign key check failed: ${JSON.stringify(fk)}`);
    db.exec(opts.apply ? 'COMMIT' : 'ROLLBACK');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return report;
}

/** Hides (1) or shows (0) the given users/courses. Rows and their content are never deleted. */
export function setHidden(db: DatabaseSync, userIds: number[], courseIds: number[], hidden: 0 | 1): void {
  const u = db.prepare("UPDATE users SET is_hidden = ? WHERE id = ? AND role != 'admin'");
  const c = db.prepare('UPDATE courses SET is_hidden = ? WHERE id = ?');
  userIds.forEach((id) => u.run(hidden, id));
  courseIds.forEach((id) => c.run(hidden, id));
}

/** Restores every hidden user and course (undo for --hide-legacy). */
export function unhideAll(db: DatabaseSync): { users: number; courses: number } {
  const users = Number(db.prepare('UPDATE users SET is_hidden = 0 WHERE is_hidden = 1').run().changes);
  const courses = Number(db.prepare('UPDATE courses SET is_hidden = 0 WHERE is_hidden = 1').run().changes);
  return { users, courses };
}
