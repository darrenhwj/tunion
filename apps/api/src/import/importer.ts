import type { DatabaseSync } from 'node:sqlite';
import { parseCsvObjects } from './csv';

export const COURSE_COLUMNS = ['code', 'name', 'description'] as const;
export const USER_COLUMNS = ['name', 'email', 'account_type', 'tutor_badge', 'current_courses', 'previous_courses'] as const;
/** Optional users.csv columns. Blank or absent = "not specified": never filled with an invented value. */
export const OPTIONAL_USER_COLUMNS = ['tutoring_subjects', 'year', 'major'] as const;

/** Course descriptions that must be checked against the source before they are trusted. Reported on every run that touches them. */
const VERIFY_DESCRIPTION: Readonly<Record<string, string>> = {
  'CIS 3207': 'the description is suspected to be incorrect or duplicated (its source record had unquoted commas); verify it against the original. No replacement text is invented',
};

export interface ImportInput { coursesCsv: string; usersCsv: string }

export interface LegacyRecord { id: number; label: string; activity: string }
export interface Removal { user: string; name: string; course: string; courseTitle: string; was: 'current' | 'completed' }
export interface ReviewRequest { id: number; student: string; course: string; status: string }
export interface ReviewSession { id: number; student: string; course: string; startsAt: string; upcoming: boolean }
/** Work left behind by a revoked tutor. Nothing is cancelled automatically; a human decides. */
export interface Revocation { email: string; openRequests: ReviewRequest[]; scheduledSessions: ReviewSession[] }

export interface ImportReport {
  errors: string[];
  warnings: string[];
  /** Data the importer cannot judge itself; a human must check these. */
  needsVerification: string[];
  courses: { added: string[]; updated: string[]; unchanged: string[] };
  users: { added: string[]; updated: string[]; unchanged: string[] };
  tutorBadges: { granted: string[]; reactivated: string[]; revoked: Revocation[]; unchanged: number };
  tutorSubjects: { added: string[]; removed: string[] };
  enrollments: { added: number; changed: number; unchanged: number; removed: Removal[]; keptNoCourseData: string[] };
  legacyUsers: LegacyRecord[];
  legacyCourses: LegacyRecord[];
}

interface CourseRow { code: string; title: string; description: string }
interface UserRow {
  name: string; email: string; admin: boolean;
  /** true = Yes (grant), false = No (revoke), undefined = not specified (leave as is). */
  badge: boolean | undefined;
  current: string[]; previous: string[];
  /** undefined = not specified (leave as is; empty for a new tutor). */
  subjects: string[] | undefined;
  year: number | undefined; major: string | undefined;
}

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
    errors: [], warnings: [], needsVerification: [],
    courses: { added: [], updated: [], unchanged: [] },
    users: { added: [], updated: [], unchanged: [] },
    tutorBadges: { granted: [], reactivated: [], revoked: [], unchanged: 0 },
    tutorSubjects: { added: [], removed: [] },
    enrollments: { added: 0, changed: 0, unchanged: 0, removed: [], keptNoCourseData: [] },
    legacyUsers: [], legacyCourses: [],
  };
}

/** Flags VERIFY_DESCRIPTION courses whether their record parsed or was rejected as malformed. */
function flagVerification(csv: string, report: ImportReport): void {
  for (const [code, why] of Object.entries(VERIFY_DESCRIPTION)) {
    const [prefix, num] = code.split(' ');
    if (new RegExp(`^\\s*"?\\s*${prefix}\\s*-?\\s*${num}\\b`, 'im').test(csv)) report.needsVerification.push(`${code}: ${why}`);
  }
}

/** Identical non-empty descriptions on different courses are almost always a copy/paste error; flag every course involved. */
function flagDuplicateDescriptions(courses: CourseRow[], report: ImportReport): void {
  const byText = new Map<string, string[]>();
  for (const c of courses) {
    const key = c.description.trim().toLowerCase().replace(/\s+/g, ' ');
    if (key) byText.set(key, [...(byText.get(key) ?? []), c.code]);
  }
  for (const codes of byText.values()) {
    if (codes.length > 1) report.needsVerification.push(`${codes.join(', ')}: identical description on ${codes.length} courses; at least one is probably a duplicate/incorrect`);
  }
}

function parseCourses(csv: string, report: ImportReport): CourseRow[] {
  const { rows, errors } = parseCsvObjects(csv, COURSE_COLUMNS);
  report.errors.push(...errors.map((e) => `courses.csv: ${e}`));
  flagVerification(csv, report);
  const seen = new Set<string>();
  const out: CourseRow[] = [];
  rows.forEach(({ row, v: r }) => {
    const line = `courses.csv row ${row}`;
    const code = normalizeCourseCode(r.code ?? '');
    if (!code) return void report.errors.push(`${line}: invalid course code "${r.code}"`);
    if (!r.name) return void report.errors.push(`${line} (${code}): name is required`);
    if (seen.has(code)) return void report.errors.push(`${line}: duplicate course code ${code}`);
    seen.add(code);
    if (code.replace(/\D/g, '').length === 4 && Number(code.slice(-4)) >= 5000) report.warnings.push(`${code}: level above 400, stored as 400`);
    out.push({ code, title: r.name, description: r.description ?? '' });
  });
  flagDuplicateDescriptions(out, report);
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
  const { rows, errors } = parseCsvObjects(csv, USER_COLUMNS);
  report.errors.push(...errors.map((e) => `users.csv: ${e}`));
  const seen = new Set<string>();
  const out: UserRow[] = [];
  rows.forEach(({ row, v: r }) => {
    const email = normalizeEmail(r.email ?? '');
    const who = `users.csv row ${row} (${email || r.name || '?'})`;
    if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email)) return void report.errors.push(`${who}: invalid email`);
    if (!r.name) return void report.errors.push(`${who}: name is required`);
    if (seen.has(email)) return void report.errors.push(`${who}: duplicate email`);
    seen.add(email);

    const type = (r.account_type ?? '').toLowerCase();
    let admin = false;
    if (type === 'admin') {
      if (!existingAdmins.has(email)) report.errors.push(`${who}: refusing to create a new admin account; only an existing admin may appear as Admin`);
      admin = true;
    } else if (type !== 'student') {
      report.warnings.push(`${who}: account_type "${r.account_type}" imported as Student${type === 'tutor' ? ' (tutor_badge decides the badge)' : ''}`);
    }

    // Explicit Yes/No decides the badge (No revokes). Blank leaves it unchanged. Anything else is an error, never guessed.
    const rawBadge = (r.tutor_badge ?? '').toLowerCase();
    let badge: boolean | undefined;
    if (rawBadge === 'yes') badge = true;
    else if (rawBadge === 'no') badge = false;
    else if (rawBadge === '') {
      if (type === 'tutor') { badge = true; report.warnings.push(`${who}: tutor_badge blank but account_type is Tutor; treated as Yes`); }
      else report.warnings.push(`${who}: tutor_badge blank; existing tutor status left unchanged`);
    } else report.errors.push(`${who}: tutor_badge "${r.tutor_badge}" must be Yes or No`);
    if (type === 'tutor' && badge === false) report.warnings.push(`${who}: account_type Tutor but tutor_badge No; the explicit No wins`);

    const current = splitCodes(r.current_courses ?? '', who, 'current_courses', known, report);
    let previous = splitCodes(r.previous_courses ?? '', who, 'previous_courses', known, report);
    const both = previous.filter((c) => current.includes(c));
    if (both.length) {
      report.warnings.push(`${who}: ${both.join(', ')} listed as both current and previous; kept as current`);
      previous = previous.filter((c) => !current.includes(c));
    }

    const subjectsRaw = r.tutoring_subjects ?? '';
    const subjects = subjectsRaw.trim() ? splitCodes(subjectsRaw, who, 'tutoring_subjects', known, report) : undefined;
    if (subjects && badge === false) report.warnings.push(`${who}: tutoring_subjects ignored because tutor_badge is No`);

    let year: number | undefined;
    if ((r.year ?? '') !== '') {
      const n = Number(r.year);
      if (Number.isInteger(n) && n >= 1 && n <= 8) year = n;
      else report.errors.push(`${who}: year "${r.year}" must be a whole number from 1 to 8, or blank if unknown`);
    }
    out.push({ name: r.name, email, admin, badge, current, previous, subjects, year, major: (r.major ?? '') || undefined });
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
 *
 * Preservation rules: users/courses are never deleted; primary keys are kept; tutor rows are never deleted (a revoked
 * badge sets tutors.is_active = 0, which keeps tutoring requests/sessions); enrollment rows for CSV users are
 * synchronised with the CSV (removals are reported) but posts, resources, groups and tutoring history are untouched.
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
  if (opts.hideLegacy && userRows.length === 0) report.errors.push('--hide-legacy refused: users.csv has no users, so every non-admin account would count as legacy');
  if (report.errors.length) return report;

  db.exec('BEGIN IMMEDIATE');
  try {
    const courseId = new Map<string, number>();
    const codeById = new Map<number, string>();
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
    for (const [code, id] of courseId) codeById.set(id, code);

    const csvEmails = new Set(userRows.map((u) => u.email));
    for (const u of userRows) {
      const existing = userByEmail.get(u.email);
      let userId: number;
      if (!existing) {
        // Year/major are only stored when the CSV gives them; otherwise the "not specified" sentinels (0 / '') are used.
        const r = db.prepare("INSERT INTO users (name, email, role, major, year) VALUES (?,?,'student',?,?)").run(u.name, u.email, u.major ?? '', u.year ?? 0);
        userId = Number(r.lastInsertRowid);
        report.users.added.push(u.email);
      } else {
        userId = existing.id as number;
        // Admins keep their role; any other matched account becomes a plain Student (tutor is a badge, not a role).
        const role = existing.role === 'admin' ? 'admin' : 'student';
        const major = u.major ?? (existing.major as string);
        const year = u.year ?? (existing.year as number);
        const changed = existing.name !== u.name || existing.role !== role || existing.is_hidden === 1 || existing.major !== major || existing.year !== year;
        if (changed) {
          db.prepare('UPDATE users SET name = ?, role = ?, major = ?, year = ?, is_hidden = 0 WHERE id = ?').run(u.name, role, major, year, userId);
          report.users.updated.push(u.email);
        } else report.users.unchanged.push(u.email);
      }

      syncTutor(db, userId, u, courseId, report);
      syncEnrollments(db, userId, u, courseId, codeById, report);
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
      report.warnings.push(`Hid ${report.legacyUsers.length} legacy user(s) and ${report.legacyCourses.length} legacy course(s) from the account selector, course directory and tutor directory`);
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

/** Applies the explicit Yes/No badge and the explicit tutoring-subject list. Tutor rows are never deleted. */
function syncTutor(db: DatabaseSync, userId: number, u: UserRow, courseId: Map<string, number>, report: ImportReport): void {
  const row = db.prepare('SELECT id, is_active FROM tutors WHERE user_id = ?').get(userId) as { id: number; is_active: number } | undefined;
  let tutorId = row?.id;
  let active = row?.is_active === 1;
  if (u.badge === true) {
    if (tutorId === undefined) {
      tutorId = Number(db.prepare("INSERT INTO tutors (user_id, headline, availability) VALUES (?, '', '')").run(userId).lastInsertRowid);
      report.tutorBadges.granted.push(u.email);
    } else if (!active) {
      db.prepare('UPDATE tutors SET is_active = 1 WHERE id = ?').run(tutorId);
      report.tutorBadges.reactivated.push(u.email);
    } else report.tutorBadges.unchanged++;
    active = true;
  } else if (u.badge === false) {
    if (tutorId !== undefined && active) {
      const tid = tutorId;
      const requests = db.prepare(`SELECT r.id, r.status, u.name student, c.code course FROM tutoring_requests r JOIN users u ON u.id = r.student_id JOIN courses c ON c.id = r.course_id
        WHERE r.tutor_id = ? AND r.status IN ('open','accepted','confirmed') ORDER BY r.id`).all(tid) as Row[];
      const sessions = db.prepare(`SELECT s.id, s.starts_at, s.ends_at, u.name student, c.code course FROM tutoring_sessions s JOIN users u ON u.id = s.student_id JOIN courses c ON c.id = s.course_id
        WHERE s.tutor_id = ? AND s.status = 'scheduled' ORDER BY s.starts_at`).all(tid) as Row[];
      const now = new Date().toISOString();
      report.tutorBadges.revoked.push({
        email: u.email,
        openRequests: requests.map((r) => ({ id: r.id as number, student: r.student as string, course: r.course as string, status: r.status as string })),
        scheduledSessions: sessions.map((x) => ({ id: x.id as number, student: x.student as string, course: x.course as string, startsAt: x.starts_at as string, upcoming: (x.ends_at as string) > now })),
      });
      db.prepare('UPDATE tutors SET is_active = 0 WHERE id = ?').run(tutorId);
    } else report.tutorBadges.unchanged++;
    active = false;
  } else if (tutorId !== undefined && active) report.tutorBadges.unchanged++;

  if (tutorId === undefined || !active) return;
  const have = new Set((db.prepare('SELECT course_id FROM tutor_courses WHERE tutor_id = ?').all(tutorId) as { course_id: number }[]).map((r) => r.course_id));
  if (u.subjects === undefined) {
    if (have.size === 0) report.warnings.push(`${u.email}: tutor has no tutoring_subjects, so they cannot be requested for any course until subjects are added`);
    return;
  }
  const want = new Set(u.subjects.map((c) => courseId.get(c)!));
  for (const id of want) if (!have.has(id)) {
    db.prepare('INSERT INTO tutor_courses (tutor_id, course_id) VALUES (?,?)').run(tutorId, id);
    report.tutorSubjects.added.push(`${u.email}: ${codeOf(courseId, id)}`);
  }
  for (const id of have) if (!want.has(id)) {
    db.prepare('DELETE FROM tutor_courses WHERE tutor_id = ? AND course_id = ?').run(tutorId, id);
    report.tutorSubjects.removed.push(`${u.email}: ${codeOf(courseId, id)}`);
  }
}

function codeOf(courseId: Map<string, number>, id: number): string {
  for (const [code, v] of courseId) if (v === id) return code;
  return `#${id}`;
}

/**
 * Makes the user's current/completed enrollments match the CSV. Rows missing from the CSV are removed and reported
 * (this only drops the enrollment link, never discussions, replies, resources, groups or tutoring history).
 * A user with both course cells blank is treated as "no course data": nothing is changed or removed.
 */
function syncEnrollments(db: DatabaseSync, userId: number, u: UserRow, courseId: Map<string, number>, codeById: Map<number, string>, report: ImportReport): void {
  const wanted = new Map<number, 'current' | 'completed'>();
  u.previous.forEach((c) => wanted.set(courseId.get(c)!, 'completed'));
  u.current.forEach((c) => wanted.set(courseId.get(c)!, 'current'));
  const have = new Map((db.prepare('SELECT course_id, status FROM enrollments WHERE user_id = ?').all(userId) as Row[]).map((e) => [e.course_id as number, e.status as 'current' | 'completed']));
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
  const stale = [...have].filter(([cid]) => !wanted.has(cid));
  if (wanted.size === 0) {
    if (stale.length) report.enrollments.keptNoCourseData.push(`${u.email} (${stale.length} existing enrollment(s) kept)`);
    return;
  }
  for (const [cid, was] of stale) {
    db.prepare('DELETE FROM enrollments WHERE user_id = ? AND course_id = ?').run(userId, cid);
    const c = db.prepare('SELECT code, title FROM courses WHERE id = ?').get(cid) as { code: string; title: string };
    report.enrollments.removed.push({ user: u.email, name: u.name, course: c.code, courseTitle: c.title, was });
  }
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
