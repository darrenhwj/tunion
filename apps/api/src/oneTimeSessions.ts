import type { AuthorSummary, OneTimeSession, UserRole } from '@tunion/shared';
import { getDb } from './db';
import { HttpError } from './http';
import { toOneTimeSession } from './mappers';

export const ONE_TIME_SELECT = `
  SELECT o.*, c.code AS course_code, c.title AS course_title, u.name AS creator_name, u.role AS creator_role
  FROM one_time_sessions o
  JOIN courses c ON c.id = o.course_id
  JOIN users u ON u.id = o.creator_id`;

/** Maps rows to sessions, attaching participants (creator first, then by join time) with one extra query. */
export function hydrateOneTimeSessions(rows: Record<string, unknown>[], viewerId: number): OneTimeSession[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id as number);
  const people = getDb()
    .prepare(
      `SELECT p.session_id, u.id, u.name, u.role FROM one_time_session_participants p JOIN users u ON u.id = p.user_id
       WHERE p.session_id IN (${ids.map(() => '?').join(',')}) ORDER BY p.joined_at, u.id`,
    )
    .all(...ids) as { session_id: number; id: number; name: string; role: UserRole }[];
  const bySession = new Map<number, AuthorSummary[]>();
  for (const p of people) {
    const list = bySession.get(p.session_id) ?? [];
    list.push({ id: p.id, name: p.name, role: p.role });
    bySession.set(p.session_id, list);
  }
  return rows.map((r) => {
    const list = bySession.get(r.id as number) ?? [];
    // Show the creator first.
    list.sort((a, b) => Number(b.id === r.creator_id) - Number(a.id === r.creator_id));
    return toOneTimeSession(r, list, viewerId);
  });
}

export function loadOneTimeSession(id: number, viewerId: number): OneTimeSession {
  const row = getDb().prepare(`${ONE_TIME_SELECT} WHERE o.id = ?`).get(id);
  if (!row) throw new HttpError(404, 'One-time session not found');
  return hydrateOneTimeSessions([row], viewerId)[0];
}
