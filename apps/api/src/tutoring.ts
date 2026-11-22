import type { LocationType, TutoringRequestDetail, TutoringSession } from '@tunion/shared';
import { getDb } from './db';
import { HttpError } from './http';
import { toJst } from './time';
import { toTutoringRequest, toTutoringSession } from './mappers';

export const REQUEST_SELECT = `
  SELECT r.*, c.code AS course_code,
    s.name AS student_name, s.role AS student_role,
    tu.id AS tutor_user_id, tu.name AS tutor_name, tu.role AS tutor_role,
    (SELECT ts.id FROM tutoring_sessions ts WHERE ts.request_id = r.id) AS session_id
  FROM tutoring_requests r
  JOIN courses c ON c.id = r.course_id
  JOIN users s ON s.id = r.student_id
  LEFT JOIN tutors t ON t.id = r.tutor_id
  LEFT JOIN users tu ON tu.id = t.user_id`;

export const SESSION_SELECT = `
  SELECT ts.*, c.code AS course_code, c.title AS course_title,
    t.user_id AS tutor_user_id, tu.name AS tutor_name, tu.role AS tutor_role,
    s.name AS student_name, s.role AS student_role
  FROM tutoring_sessions ts
  JOIN courses c ON c.id = ts.course_id
  JOIN tutors t ON t.id = ts.tutor_id
  JOIN users tu ON tu.id = t.user_id
  JOIN users s ON s.id = ts.student_id`;

export function loadRequest(id: number): TutoringRequestDetail {
  const row = getDb().prepare(`${REQUEST_SELECT} WHERE r.id = ?`).get(id);
  if (!row) throw new HttpError(404, 'Tutoring request not found');
  return toTutoringRequest(row);
}

export function loadSession(id: number): TutoringSession {
  const row = getDb().prepare(`${SESSION_SELECT} WHERE ts.id = ?`).get(id);
  if (!row) throw new HttpError(404, 'Tutoring session not found');
  return toTutoringSession(row);
}

/** The Tutor.id of a user's ACTIVE tutor profile (a revoked badge means no profile). Historical rows keep their tutor_id. */
export function tutorIdForUser(userId: number): number | undefined {
  const row = getDb().prepare('SELECT id FROM tutors WHERE user_id = ? AND is_active = 1').get(userId) as { id: number } | undefined;
  return row?.id;
}

/** True when the user (as student or tutor) already has a scheduled session overlapping [startsAt, endsAt). */
export function hasSessionConflict(userId: number, startsAt: string, endsAt: string): boolean {
  return !!getDb()
    .prepare(
      `SELECT 1 FROM tutoring_sessions ts JOIN tutors t ON t.id = ts.tutor_id
       WHERE ts.status = 'scheduled' AND ts.starts_at < :end AND ts.ends_at > :start
         AND (ts.student_id = :u OR t.user_id = :u) LIMIT 1`,
    )
    .get({ u: userId, start: startsAt, end: endsAt });
}


export function fitsTutorAvailability(tutorId: number, startsAt: string, endsAt: string, locationType: LocationType, slotId: number | null = null) {
  const start = toJst(startsAt);
  const end = toJst(endsAt);
  if (start.slice(0, 10) !== end.slice(0, 10)) return false;
  const weekday = new Date(start.slice(0, 10) + 'T00:00:00Z').getUTCDay();
  return !!getDb().prepare(`
    SELECT 1 FROM tutor_availability_slots
    WHERE tutor_id = :tutorId AND day_of_week = :weekday AND location_type = :locationType
      AND start_time || ':00.000' <= :start AND end_time || ':00.000' >= :end
      AND (:slotId IS NULL OR id = :slotId)
  `).get({ tutorId, weekday, locationType, start: start.slice(11, 23), end: end.slice(11, 23), slotId });
}
