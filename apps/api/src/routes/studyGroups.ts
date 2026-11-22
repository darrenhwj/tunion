import { Router } from 'express';
import type {
  GetStudyGroupResponse, ListStudyGroupSessionsResponse, ListStudyGroupsResponse, StudyGroupSessionResponse,
} from '@tunion/shared';
import { getDb } from '../db';
import { toStudyGroup, toStudyGroupSession } from '../mappers';
import { HttpError, bodyObject, optionalDemoUser, parseId, requireDemoUser, str } from '../http';
import { GROUP_SESSION_SELECT, loadGroupSession } from '../studyGroupSessions';
import { nowIso, parseFutureMeeting } from '../time';

// Read-only browse + group sessions. Creating/joining/leaving groups is not implemented yet.
export const studyGroupsRouter = Router();
export const studyGroupSessionsRouter = Router();

function groups(where: string, params: Record<string, number>) {
  const db = getDb();
  return db.prepare(`SELECT * FROM study_groups ${where} ORDER BY id`).all(params).map((row) => {
    const members = db.prepare('SELECT user_id FROM study_group_members WHERE group_id = ? ORDER BY user_id').all(row.id as number) as { user_id: number }[];
    return toStudyGroup(row, members.map((m) => m.user_id));
  });
}

studyGroupsRouter.get('/', (req, res) => {
  const courseId = req.query.courseId === undefined ? undefined : parseId(req.query.courseId, 'courseId');
  const list = courseId === undefined ? groups('', {}) : groups('WHERE course_id = :courseId', { courseId });
  res.json({ studyGroups: list } satisfies ListStudyGroupsResponse);
});

studyGroupsRouter.get('/:id', (req, res) => {
  const [studyGroup] = groups('WHERE id = :id', { id: parseId(req.params.id, 'group id') });
  if (!studyGroup) throw new HttpError(404, 'Study group not found');
  res.json({ studyGroup } satisfies GetStudyGroupResponse);
});

studyGroupsRouter.get('/:id/sessions', optionalDemoUser, (req, res) => {
  const id = parseId(req.params.id, 'group id');
  if (!getDb().prepare('SELECT 1 FROM study_groups WHERE id = ?').get(id)) throw new HttpError(404, 'Study group not found');
  const rows = getDb()
    .prepare(`${GROUP_SESSION_SELECT} WHERE gs.group_id = :id ORDER BY gs.starts_at, gs.id`)
    .all({ id, viewer: req.demoUser?.id ?? 0 });
  res.json({ sessions: rows.map(toStudyGroupSession) } satisfies ListStudyGroupSessionsResponse);
});

studyGroupsRouter.post('/:id/sessions', requireDemoUser, (req, res) => {
  const id = parseId(req.params.id, 'group id');
  const group = getDb().prepare('SELECT creator_id, location FROM study_groups WHERE id = ?').get(id) as { creator_id: number; location: string } | undefined;
  if (!group) throw new HttpError(404, 'Study group not found');
  if (group.creator_id !== req.demoUser!.id) throw new HttpError(403, 'Only the group creator can schedule sessions');
  const body = bodyObject(req.body);
  const title = str(body, 'title', 3, 200);
  const { startsAt, endsAt } = parseFutureMeeting(body.startsAt, body.endsAt, 12);
  const location = body.location === undefined ? group.location : str(body, 'location', 0, 300);
  const { lastInsertRowid } = getDb()
    .prepare('INSERT INTO study_group_sessions (group_id, title, starts_at, ends_at, location, created_by_id, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, title, startsAt, endsAt, location, req.demoUser!.id, nowIso());
  res.status(201).json({ session: loadGroupSession(Number(lastInsertRowid), req.demoUser!.id) } satisfies StudyGroupSessionResponse);
});

studyGroupSessionsRouter.post('/:id/cancel', requireDemoUser, (req, res) => {
  const session = loadGroupSession(parseId(req.params.id, 'session id'), req.demoUser!.id);
  if (session.createdById !== req.demoUser!.id) throw new HttpError(403, 'Only the session creator can cancel it');
  if (session.status !== 'scheduled') throw new HttpError(409, `Cannot cancel a session that is ${session.status}`);
  getDb().prepare("UPDATE study_group_sessions SET status = 'cancelled' WHERE id = ?").run(session.id);
  res.json({ session: loadGroupSession(session.id, req.demoUser!.id) } satisfies StudyGroupSessionResponse);
});
