import { Router } from 'express';
import type {
  CreateOneTimeSessionResponse, GetOneTimeSessionResponse, ListOneTimeSessionsResponse, OneTimeSessionResponse,
} from '@tunion/shared';
import { getDb } from '../db';
import { HttpError, bodyObject, optionalDemoUser, parseId, queryInt, queryString, requireDemoUser, str } from '../http';
import { ONE_TIME_SELECT, hydrateOneTimeSessions, loadOneTimeSession } from '../oneTimeSessions';
import { nowIso, parseBound, parseFutureMeeting } from '../time';

// Standalone sessions: one date, one place, no recurrence and no StudyGroup. The creator is auto-joined.
export const oneTimeSessionsRouter = Router();

// GET /api/one-time-sessions?courseId=&from=&to=&joined=&open=&status=&limit=
oneTimeSessionsRouter.get('/', optionalDemoUser, (req, res) => {
  const viewer = req.demoUser?.id ?? 0;
  const where: string[] = [];
  const params: Record<string, string | number> = {};
  if (req.query.courseId !== undefined) {
    where.push('o.course_id = :courseId');
    params.courseId = parseId(req.query.courseId, 'courseId');
  }
  const fromRaw = queryString(req.query.from, 'from', 40);
  const toRaw = queryString(req.query.to, 'to', 40);
  where.push('o.ends_at > :from');
  params.from = fromRaw ? parseBound(fromRaw, 'from') : nowIso();
  if (toRaw) {
    where.push('o.starts_at < :to');
    params.to = parseBound(toRaw, 'to');
  }
  const status = queryString(req.query.status, 'status', 10) ?? 'scheduled';
  if (status !== 'scheduled' && status !== 'cancelled') throw new HttpError(400, "status must be 'scheduled' or 'cancelled'");
  where.push('o.status = :status');
  params.status = status;
  const flag = (name: string) => {
    const v = queryString(req.query[name], name, 5);
    if (v !== undefined && v !== 'true' && v !== 'false') throw new HttpError(400, `${name} must be 'true' or 'false'`);
    return v === 'true';
  };
  const participantOf = 'EXISTS (SELECT 1 FROM one_time_session_participants p WHERE p.session_id = o.id AND p.user_id = :viewer)';
  if (flag('joined')) {
    if (!viewer) throw new HttpError(401, 'Select a demo user (x-demo-user-id header required)');
    where.push(participantOf);
    params.viewer = viewer;
  }
  if (flag('open')) {
    where.push(`NOT ${participantOf}`, '(SELECT COUNT(*) FROM one_time_session_participants p WHERE p.session_id = o.id) < o.max_participants', 'o.starts_at > :now');
    params.now = nowIso();
    params.viewer = viewer; // node:sqlite rejects bound names the SQL does not use, so only bind when referenced
  }
  params.limit = queryInt(req.query.limit, 'limit', 1, 100, 50);
  const rows = getDb().prepare(`${ONE_TIME_SELECT} WHERE ${where.join(' AND ')} ORDER BY o.starts_at, o.id LIMIT :limit`).all(params);
  res.json({ sessions: hydrateOneTimeSessions(rows, viewer) } satisfies ListOneTimeSessionsResponse);
});

oneTimeSessionsRouter.post('/', requireDemoUser, (req, res) => {
  const body = bodyObject(req.body);
  const courseId = parseId(body.courseId, 'courseId');
  const title = str(body, 'title', 3, 200);
  const description = body.description === undefined ? '' : str(body, 'description', 0, 2000);
  const location = str(body, 'location', 1, 300);
  const { startsAt, endsAt } = parseFutureMeeting(body.startsAt, body.endsAt, 12);
  let max = 10;
  if (body.maxParticipants !== undefined) {
    if (typeof body.maxParticipants !== 'number' || !Number.isInteger(body.maxParticipants) || body.maxParticipants < 2 || body.maxParticipants > 50) {
      throw new HttpError(400, 'maxParticipants must be an integer from 2 to 50');
    }
    max = body.maxParticipants;
  }
  const db = getDb();
  if (!db.prepare('SELECT 1 FROM courses WHERE id = ?').get(courseId)) throw new HttpError(404, 'Course not found');
  const userId = req.demoUser!.id;
  let id: number;
  db.exec('BEGIN');
  try {
    const now = nowIso();
    id = Number(
      db.prepare(
        `INSERT INTO one_time_sessions (course_id, creator_id, title, description, starts_at, ends_at, location, max_participants, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      ).run(courseId, userId, title, description, startsAt, endsAt, location, max, now).lastInsertRowid,
    );
    db.prepare('INSERT INTO one_time_session_participants (session_id, user_id, joined_at) VALUES (?,?,?)').run(id, userId, now);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  res.status(201).json({ session: loadOneTimeSession(id, userId) } satisfies CreateOneTimeSessionResponse);
});

oneTimeSessionsRouter.get('/:id', optionalDemoUser, (req, res) => {
  res.json({ session: loadOneTimeSession(parseId(req.params.id, 'session id'), req.demoUser?.id ?? 0) } satisfies GetOneTimeSessionResponse);
});

oneTimeSessionsRouter.post('/:id/join', requireDemoUser, (req, res) => {
  const id = parseId(req.params.id, 'session id');
  const userId = req.demoUser!.id;
  const db = getDb();
  const session = loadOneTimeSession(id, userId);
  if (session.status !== 'scheduled') throw new HttpError(409, 'This session was cancelled');
  if (session.startsAt <= nowIso()) throw new HttpError(409, 'This session has already started');
  if (session.isParticipant) throw new HttpError(409, 'You have already joined this session');
  if (session.participantCount >= session.maxParticipants) throw new HttpError(409, 'This session is full');
  // The composite primary key is the final guard against duplicates, even under concurrent requests.
  const { changes } = db
    .prepare('INSERT OR IGNORE INTO one_time_session_participants (session_id, user_id, joined_at) VALUES (?,?,?)')
    .run(id, userId, nowIso());
  if (changes === 0) throw new HttpError(409, 'You have already joined this session');
  res.status(201).json({ session: loadOneTimeSession(id, userId) } satisfies OneTimeSessionResponse);
});

oneTimeSessionsRouter.delete('/:id/join', requireDemoUser, (req, res) => {
  const id = parseId(req.params.id, 'session id');
  const userId = req.demoUser!.id;
  const session = loadOneTimeSession(id, userId);
  if (session.isCreator) throw new HttpError(403, 'The creator cannot leave their own session; cancel it instead');
  if (session.status !== 'scheduled') throw new HttpError(409, 'This session was cancelled');
  if (!session.isParticipant) throw new HttpError(409, 'You have not joined this session');
  getDb().prepare('DELETE FROM one_time_session_participants WHERE session_id = ? AND user_id = ?').run(id, userId);
  res.json({ session: loadOneTimeSession(id, userId) } satisfies OneTimeSessionResponse);
});

oneTimeSessionsRouter.post('/:id/cancel', requireDemoUser, (req, res) => {
  const id = parseId(req.params.id, 'session id');
  const userId = req.demoUser!.id;
  const session = loadOneTimeSession(id, userId);
  if (!session.isCreator) throw new HttpError(403, 'Only the creator can cancel this session');
  if (session.status !== 'scheduled') throw new HttpError(409, `Cannot cancel a session that is ${session.status}`);
  getDb().prepare("UPDATE one_time_sessions SET status = 'cancelled' WHERE id = ?").run(id);
  res.json({ session: loadOneTimeSession(id, userId) } satisfies OneTimeSessionResponse);
});
