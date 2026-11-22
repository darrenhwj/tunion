import { Router } from 'express';
import type { ListTutoringSessionsResponse, TutoringSession, TutoringSessionResponse, TutoringSessionStatus } from '@tunion/shared';
import { getDb } from '../db';
import { toTutoringSession } from '../mappers';
import { HttpError, parseId, queryString, requireDemoUser } from '../http';
import { SESSION_SELECT, loadSession } from '../tutoring';
import { nowIso } from '../time';

export const tutoringSessionsRouter = Router();
tutoringSessionsRouter.use(requireDemoUser);

const STATUSES: TutoringSessionStatus[] = ['scheduled', 'completed', 'cancelled'];

tutoringSessionsRouter.get('/', (req, res) => {
  const status = queryString(req.query.status, 'status', 10);
  if (status !== undefined && !STATUSES.includes(status as TutoringSessionStatus)) throw new HttpError(400, `status must be one of ${STATUSES.join(', ')}`);
  const params: Record<string, string | number> = { u: req.demoUser!.id };
  if (status) params.status = status;
  const rows = getDb()
    .prepare(`${SESSION_SELECT} WHERE (ts.student_id = :u OR t.user_id = :u) ${status ? 'AND ts.status = :status' : ''} ORDER BY ts.starts_at, ts.id`)
    .all(params);
  res.json({ sessions: rows.map(toTutoringSession) } satisfies ListTutoringSessionsResponse);
});

function participantSession(id: unknown, userId: number): TutoringSession {
  const session = loadSession(parseId(id, 'session id'));
  if (session.student.id !== userId && session.tutor.id !== userId) throw new HttpError(403, 'You are not a participant in this session');
  return session;
}

tutoringSessionsRouter.get('/:id', (req, res) => {
  res.json({ session: participantSession(req.params.id, req.demoUser!.id) } satisfies TutoringSessionResponse);
});

/** Applies a terminal transition to the session and mirrors it on the originating request. */
function finish(session: TutoringSession, to: 'completed' | 'cancelled', byUserId: number) {
  const db = getDb();
  const now = nowIso();
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE tutoring_sessions SET status = ?, cancelled_by_id = ?, updated_at = ? WHERE id = ?')
      .run(to, to === 'cancelled' ? byUserId : null, now, session.id);
    if (session.requestId !== null) {
      db.prepare('UPDATE tutoring_requests SET status = ?, updated_at = ? WHERE id = ?').run(to, now, session.requestId);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

tutoringSessionsRouter.post('/:id/complete', (req, res) => {
  const session = participantSession(req.params.id, req.demoUser!.id);
  if (session.tutor.id !== req.demoUser!.id) throw new HttpError(403, 'Only the tutor can mark a session completed');
  if (session.status !== 'scheduled') throw new HttpError(409, `Cannot complete a session that is ${session.status}`);
  if (session.startsAt > nowIso()) throw new HttpError(409, 'Cannot complete a session that has not started yet');
  finish(session, 'completed', req.demoUser!.id);
  res.json({ session: loadSession(session.id) } satisfies TutoringSessionResponse);
});

tutoringSessionsRouter.post('/:id/cancel', (req, res) => {
  const session = participantSession(req.params.id, req.demoUser!.id);
  if (session.status !== 'scheduled') throw new HttpError(409, `Cannot cancel a session that is ${session.status}`);
  finish(session, 'cancelled', req.demoUser!.id);
  res.json({ session: loadSession(session.id) } satisfies TutoringSessionResponse);
});
