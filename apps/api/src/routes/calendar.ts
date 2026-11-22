import { Router } from 'express';
import type { StudyGroupCalendarResponse, TutoringCalendarResponse, TutoringSessionStatus } from '@tunion/shared';
import { getDb } from '../db';
import { toStudyGroupSession, toTutoringSession } from '../mappers';
import { HttpError, queryString, requireDemoUser } from '../http';
import { SESSION_SELECT } from '../tutoring';
import { GROUP_SESSION_SELECT } from '../studyGroupSessions';
import { ONE_TIME_SELECT, hydrateOneTimeSessions } from '../oneTimeSessions';
import { nowIso, parseCalendarRange } from '../time';

export const calendarRouter = Router();
calendarRouter.use(requireDemoUser);

// GET /api/calendar/tutoring - sessions where the signed-in user is the student or the tutor.
calendarRouter.get('/tutoring', (req, res) => {
  const range = parseCalendarRange(req.query.from, req.query.to);
  const status = queryString(req.query.status, 'status', 10);
  if (status !== undefined && !['scheduled', 'completed', 'cancelled'].includes(status)) {
    throw new HttpError(400, 'status must be scheduled, completed or cancelled');
  }
  const params: Record<string, string | number> = { u: req.demoUser!.id, from: range.from, to: range.to };
  if (status) params.status = status as TutoringSessionStatus;
  const rows = getDb()
    .prepare(
      `${SESSION_SELECT}
       WHERE (ts.student_id = :u OR t.user_id = :u) AND ts.starts_at < :to AND ts.ends_at > :from
       ${status ? 'AND ts.status = :status' : "AND ts.status != 'cancelled'"}
       ORDER BY ts.starts_at, ts.id`,
    )
    .all(params);
  res.json({ range, sessions: rows.map(toTutoringSession) } satisfies TutoringCalendarResponse);
});

// GET /api/calendar/study-groups?scope=mine|discover
calendarRouter.get('/study-groups', (req, res) => {
  const range = parseCalendarRange(req.query.from, req.query.to);
  const scope = queryString(req.query.scope, 'scope', 10) ?? 'mine';
  if (scope !== 'mine' && scope !== 'discover') throw new HttpError(400, "scope must be 'mine' or 'discover'");
  const membership =
    scope === 'mine'
      ? 'AND EXISTS (SELECT 1 FROM study_group_members m WHERE m.group_id = gs.group_id AND m.user_id = :viewer)'
      : `AND NOT EXISTS (SELECT 1 FROM study_group_members m WHERE m.group_id = gs.group_id AND m.user_id = :viewer)
         AND g.course_id IN (SELECT course_id FROM enrollments WHERE user_id = :viewer)
         AND (SELECT COUNT(*) FROM study_group_members m WHERE m.group_id = gs.group_id) < g.max_members`;
  const rows = getDb()
    .prepare(
      `${GROUP_SESSION_SELECT}
       WHERE gs.status = 'scheduled' AND gs.starts_at < :to AND gs.ends_at > :from ${membership}
       ORDER BY gs.starts_at, gs.id`,
    )
    .all({ viewer: req.demoUser!.id, from: range.from, to: range.to });

  // One-time sessions: joined (incl. created) for 'mine'; open ones in the user's courses for 'discover'. They never recur.
  const joined = 'EXISTS (SELECT 1 FROM one_time_session_participants p WHERE p.session_id = o.id AND p.user_id = :viewer)';
  const oneTimeFilter =
    scope === 'mine'
      ? `AND ${joined}`
      : `AND NOT ${joined} AND o.starts_at > :now AND o.course_id IN (SELECT course_id FROM enrollments WHERE user_id = :viewer)
         AND (SELECT COUNT(*) FROM one_time_session_participants p WHERE p.session_id = o.id) < o.max_participants`;
  const oneTimeParams: Record<string, string | number> = { viewer: req.demoUser!.id, from: range.from, to: range.to };
  if (scope === 'discover') oneTimeParams.now = nowIso();
  const oneTimeRows = getDb()
    .prepare(`${ONE_TIME_SELECT} WHERE o.status = 'scheduled' AND o.starts_at < :to AND o.ends_at > :from ${oneTimeFilter} ORDER BY o.starts_at, o.id`)
    .all(oneTimeParams);
  res.json({
    range,
    sessions: rows.map(toStudyGroupSession),
    oneTimeSessions: hydrateOneTimeSessions(oneTimeRows, req.demoUser!.id),
  } satisfies StudyGroupCalendarResponse);
});
