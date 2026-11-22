import type { DatabaseSync } from 'node:sqlite';
import { parseCsv, parseCsvObjects } from './csv';
import { USER_COLUMNS, normalizeCourseCode, normalizeEmail } from './importer';

/**
 * One-off correction for source rows whose current_courses and previous_courses columns were entered the wrong way
 * round. It is deliberately narrow:
 * - only the explicitly listed emails are touched (never selected by Tutor badge or anything else);
 * - only enrollments.status changes (current <-> completed), nothing else;
 * - a user is changed only if their enrollments still match the source CSV exactly, so a second run is refused
 *   instead of swapping them back, and records edited since the import are never overwritten.
 */
export interface SwapUserResult {
  email: string;
  outcome: 'swapped' | 'already-corrected' | 'refused';
  current: number;
  previous: number;
  reason?: string;
}
export interface SwapReport { users: SwapUserResult[]; errors: string[] }

type State = Map<number, 'current' | 'completed'>;

function sameState(a: State, b: State): boolean {
  return a.size === b.size && [...a].every(([course, status]) => b.get(course) === status);
}

function flip(s: State): State {
  return new Map([...s].map(([course, status]) => [course, status === 'current' ? 'completed' : 'current'] as const));
}

export function swapEnrollments(db: DatabaseSync, usersCsv: string, emails: string[], opts: { apply: boolean }): SwapReport {
  const report: SwapReport = { users: [], errors: [] };
  const wanted = [...new Set(emails.map(normalizeEmail))];
  if (!wanted.length) report.errors.push('Give at least one --email');
  const { rows, errors } = parseCsvObjects(usersCsv, USER_COLUMNS);
  report.errors.push(...errors.map((e) => `users.csv: ${e}`));
  const byEmail = new Map(rows.map((r) => [normalizeEmail(r.v.email ?? ''), r.v]));
  const courseId = new Map<string, number>();
  for (const c of db.prepare('SELECT id, code FROM courses').all() as { id: number; code: string }[]) {
    const code = normalizeCourseCode(c.code);
    if (code) courseId.set(code, c.id);
  }

  const plans: { email: string; userId: number; fromCsv: State }[] = [];
  for (const email of wanted) {
    const row = byEmail.get(email);
    const user = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email) as { id: number } | undefined;
    if (!row) { report.errors.push(`${email}: not found in the CSV`); continue; }
    if (!user) { report.errors.push(`${email}: not found in the database`); continue; }
    const fromCsv: State = new Map();
    for (const [column, status] of [['previous_courses', 'completed'], ['current_courses', 'current']] as const) {
      for (const part of (row[column] ?? '').split(',').map((p) => p.trim()).filter(Boolean)) {
        const code = normalizeCourseCode(part);
        const id = code ? courseId.get(code) : undefined;
        if (id === undefined) report.errors.push(`${email}: unknown course "${part}"`);
        else fromCsv.set(id, status);
      }
    }
    plans.push({ email, userId: user.id, fromCsv });
  }
  if (report.errors.length) return report;

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const { email, userId, fromCsv } of plans) {
      const rows = db.prepare('SELECT course_id, status FROM enrollments WHERE user_id = ?').all(userId) as { course_id: number; status: 'current' | 'completed' }[];
      const inDb: State = new Map(rows.map((r) => [r.course_id, r.status]));
      const count = (state: State, status: string) => [...state.values()].filter((s) => s === status).length;
      if (sameState(inDb, fromCsv)) {
        db.prepare("UPDATE enrollments SET status = CASE status WHEN 'current' THEN 'completed' ELSE 'current' END WHERE user_id = ?").run(userId);
        const after = flip(inDb);
        report.users.push({ email, outcome: 'swapped', current: count(after, 'current'), previous: count(after, 'completed') });
      } else if (sameState(inDb, flip(fromCsv))) {
        report.users.push({ email, outcome: 'already-corrected', current: count(inDb, 'current'), previous: count(inDb, 'completed') });
      } else {
        report.users.push({ email, outcome: 'refused', current: count(inDb, 'current'), previous: count(inDb, 'completed'), reason: 'enrollments no longer match the CSV (edited since import); not touching them' });
      }
    }
    if (report.users.some((u) => u.outcome === 'refused')) throw new Error('refused');
    db.exec(opts.apply ? 'COMMIT' : 'ROLLBACK');
  } catch (err) {
    db.exec('ROLLBACK');
    if ((err as Error).message !== 'refused') throw err;
  }
  return report;
}

const quote = (cell: string) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);

/** Returns the CSV with current_courses and previous_courses exchanged for the listed emails only, so a future re-import keeps the fix. */
export function swapCsvColumns(usersCsv: string, emails: string[]): string {
  const table = parseCsv(usersCsv);
  const header = table[0].map((h) => h.trim().toLowerCase());
  const [email, current, previous] = ['email', 'current_courses', 'previous_courses'].map((h) => header.indexOf(h));
  const wanted = new Set(emails.map(normalizeEmail));
  const out = table.map((cells, i) => {
    if (i === 0 || !wanted.has(normalizeEmail(cells[email] ?? ''))) return cells;
    const copy = [...cells];
    [copy[current], copy[previous]] = [cells[previous], cells[current]];
    return copy;
  });
  return out.map((cells) => cells.map(quote).join(',')).join('\n') + '\n';
}
