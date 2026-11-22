import { Router } from 'express';
import type { AdminDeleteDiscussionResponse, GetTutorImpactResponse, SetTutorBadgeResponse, TutorBadgeImpact, TutoringRequestStatus } from '@tunion/shared';
import { getDb } from '../db';
import { toUser } from '../mappers';
import { HttpError, bodyObject, parseId, requireAdmin } from '../http';
import { nowIso } from '../time';
import { USER_SELECT } from '../userQueries';

/**
 * Admin-only moderation. Every route sits behind requireAdmin, which re-reads the caller's role from the database.
 * LIMITATION: identity is the insecure demo header (x-demo-user-id), so anyone who sends an admin's id is "the admin".
 * This is real server-side authorization of the demo account, not real authentication.
 */
export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.delete('/discussions/:id', (req, res) => {
  const id = parseId(req.params.id, 'discussion id');
  const db = getDb();
  const row = db.prepare('SELECT deleted_at FROM discussions WHERE id = ?').get(id) as { deleted_at: string | null } | undefined;
  if (!row) throw new HttpError(404, 'Discussion not found');
  if (row.deleted_at) throw new HttpError(410, 'This discussion was already deleted');
  // Soft delete only: replies, votes and the author are untouched.
  db.prepare('UPDATE discussions SET deleted_at = ?, deleted_by_id = ? WHERE id = ?').run(nowIso(), req.demoUser!.id, id);
  res.json({ deleted: true, id } satisfies AdminDeleteDiscussionResponse);
});

function loadTarget(raw: unknown) {
  const id = parseId(raw, 'user id');
  const row = getDb().prepare(`${USER_SELECT} WHERE u.id = ?`).get(id);
  if (!row) throw new HttpError(404, 'User not found');
  if (row.role === 'admin') throw new HttpError(400, 'Admin accounts do not use tutor badges');
  return id;
}

/** Requests still waiting on this user as a tutor and sessions they are still due to teach. Nothing is changed here. */
function impactFor(userId: number): TutorBadgeImpact {
  const db = getDb();
  const requests = db
    .prepare(
      `SELECT r.id, r.status, c.code, s.name AS student_name FROM tutoring_requests r
       JOIN tutors t ON t.id = r.tutor_id JOIN courses c ON c.id = r.course_id JOIN users s ON s.id = r.student_id
       WHERE t.user_id = ? AND r.status IN ('open','accepted') ORDER BY r.id`,
    )
    .all(userId);
  const sessions = db
    .prepare(
      `SELECT ts.id, ts.starts_at, c.code, s.name AS student_name FROM tutoring_sessions ts
       JOIN tutors t ON t.id = ts.tutor_id JOIN courses c ON c.id = ts.course_id JOIN users s ON s.id = ts.student_id
       WHERE t.user_id = ? AND ts.status = 'scheduled' AND ts.starts_at > ? ORDER BY ts.starts_at`,
    )
    .all(userId, nowIso());
  return {
    openRequests: requests.map((r) => ({ id: r.id as number, courseCode: r.code as string, status: r.status as TutoringRequestStatus, studentName: r.student_name as string })),
    upcomingSessions: sessions.map((s) => ({ id: s.id as number, courseCode: s.code as string, startsAt: s.starts_at as string, studentName: s.student_name as string })),
  };
}

const userById = (id: number) => toUser(getDb().prepare(`${USER_SELECT} WHERE u.id = ?`).get(id)!);

adminRouter.get('/users/:id/tutor-impact', (req, res) => {
  const id = loadTarget(req.params.id);
  res.json({ user: userById(id), impact: impactFor(id) } satisfies GetTutorImpactResponse);
});

adminRouter.put('/users/:id/tutor-badge', (req, res) => {
  const id = loadTarget(req.params.id);
  const { isTutor } = bodyObject(req.body);
  if (typeof isTutor !== 'boolean') throw new HttpError(400, 'isTutor must be true or false');
  const db = getDb();
  const tutor = db.prepare('SELECT id FROM tutors WHERE user_id = ?').get(id) as { id: number } | undefined;
  if (isTutor) {
    // Re-activating keeps the old subjects and availability. A brand-new tutor starts with none and must configure them.
    if (tutor) db.prepare('UPDATE tutors SET is_active = 1 WHERE id = ?').run(tutor.id);
    else db.prepare("INSERT INTO tutors (user_id, headline, availability) VALUES (?, '', '')").run(id);
  } else if (tutor) {
    // The row is kept: requests, sessions and calendars reference it.
    db.prepare('UPDATE tutors SET is_active = 0 WHERE id = ?').run(tutor.id);
  }
  res.json({ user: userById(id), impact: impactFor(id) } satisfies SetTutorBadgeResponse);
});
