import { Router } from 'express';
import type {
  ConfirmTutoringRequestResponse, CreateTutoringRequestResponse, GetTutoringRequestResponse, ListTutoringRequestsResponse,
  LocationType, TutoringRequestResponse, TutoringRequestStatus,
} from '@tunion/shared';
import { LOCATION_TYPES } from '@tunion/shared';
import { getDb } from '../db';
import { toTutoringRequest } from '../mappers';
import { HttpError, bodyObject, parseId, queryString, requireDemoUser } from '../http';
import { REQUEST_SELECT, hasSessionConflict, loadRequest, loadSession } from '../tutoring';
import { nowIso, parseFutureMeeting } from '../time';

export const tutoringRequestsRouter = Router();
tutoringRequestsRouter.use(requireDemoUser);

const STATUSES: TutoringRequestStatus[] = ['open', 'accepted', 'confirmed', 'rejected', 'completed', 'cancelled'];

function optionalText(obj: Record<string, unknown>, field: string, max: number): string {
  const v = obj[field];
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string' || v.trim().length > max) throw new HttpError(400, `${field} must be a string of at most ${max} characters`);
  return v.trim();
}

function transition(id: number, to: TutoringRequestStatus, extra: Record<string, string | null> = {}) {
  const sets = Object.keys(extra).map((k) => `${k} = :${k}`).join(', ');
  getDb()
    .prepare(`UPDATE tutoring_requests SET status = :status, updated_at = :now${sets ? `, ${sets}` : ''} WHERE id = :id`)
    .run({ status: to, now: nowIso(), id, ...extra });
}

function requireStatus(current: TutoringRequestStatus, allowed: TutoringRequestStatus[], action: string) {
  if (!allowed.includes(current)) throw new HttpError(409, `Cannot ${action} a request that is ${current}`);
}

tutoringRequestsRouter.post('/', (req, res) => {
  const user = req.demoUser!;
  const body = bodyObject(req.body);
  const courseId = parseId(body.courseId, 'courseId');
  const tutorId = parseId(body.tutorId, 'tutorId');
  if (typeof body.topic !== 'string' || body.topic.trim().length < 3 || body.topic.trim().length > 200) {
    throw new HttpError(400, 'topic must be 3-200 characters');
  }
  const details = optionalText(body, 'details', 5000);
  const slotId = body.slotId == null ? null : parseId(body.slotId, 'slotId');
  const db = getDb();
  if (!db.prepare('SELECT 1 FROM courses WHERE id = ?').get(courseId)) throw new HttpError(404, 'Course not found');
  const tutor = db.prepare('SELECT user_id FROM tutors WHERE id = ?').get(tutorId) as { user_id: number } | undefined;
  if (!tutor) throw new HttpError(404, 'Tutor not found');
  if (tutor.user_id === user.id) throw new HttpError(400, 'You cannot request tutoring from yourself');
  if (!db.prepare('SELECT 1 FROM tutor_courses WHERE tutor_id = ? AND course_id = ?').get(tutorId, courseId)) {
    throw new HttpError(400, 'This tutor does not tutor that course');
  }
  if (slotId !== null && !db.prepare('SELECT 1 FROM tutor_availability_slots WHERE id = ? AND tutor_id = ?').get(slotId, tutorId)) {
    throw new HttpError(400, 'slotId does not belong to that tutor');
  }
  const now = nowIso();
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO tutoring_requests (course_id, student_id, tutor_id, topic, details, slot_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`)
    .run(courseId, user.id, tutorId, body.topic.trim(), details, slotId, now, now);
  res.status(201).json({ request: loadRequest(Number(lastInsertRowid)) } satisfies CreateTutoringRequestResponse);
});

tutoringRequestsRouter.get('/', (req, res) => {
  const role = queryString(req.query.role, 'role', 10);
  if (role !== undefined && role !== 'student' && role !== 'tutor') throw new HttpError(400, "role must be 'student' or 'tutor'");
  const status = queryString(req.query.status, 'status', 12);
  if (status !== undefined && !STATUSES.includes(status as TutoringRequestStatus)) throw new HttpError(400, `status must be one of ${STATUSES.join(', ')}`);
  const mine = role === 'student' ? 'r.student_id = :u' : role === 'tutor' ? 't.user_id = :u' : '(r.student_id = :u OR t.user_id = :u)';
  const params: Record<string, string | number> = { u: req.demoUser!.id };
  if (status) params.status = status;
  const rows = getDb()
    .prepare(`${REQUEST_SELECT} WHERE ${mine} ${status ? 'AND r.status = :status' : ''} ORDER BY r.created_at DESC, r.id DESC`)
    .all(params);
  res.json({ requests: rows.map(toTutoringRequest) } satisfies ListTutoringRequestsResponse);
});

tutoringRequestsRouter.get('/:id', (req, res) => {
  const request = loadRequest(parseId(req.params.id, 'request id'));
  const u = req.demoUser!.id;
  if (request.studentId !== u && request.tutor?.id !== u) throw new HttpError(403, 'You are not a participant in this request');
  res.json({ request } satisfies GetTutoringRequestResponse);
});

/** Loads a request and requires the caller to be its tutor (or its student). */
function asRole(req: { params: Record<string, string>; demoUser?: { id: number } }, role: 'tutor' | 'student') {
  const request = loadRequest(parseId(req.params.id, 'request id'));
  const u = req.demoUser!.id;
  const ok = role === 'tutor' ? request.tutor?.id === u : request.studentId === u;
  if (!ok) throw new HttpError(403, role === 'tutor' ? 'Only the requested tutor can do this' : 'Only the student who made the request can do this');
  return request;
}

tutoringRequestsRouter.post('/:id/approve', (req, res) => {
  const request = asRole(req, 'tutor');
  requireStatus(request.status, ['open'], 'approve');
  const body = bodyObject(req.body);
  const { startsAt, endsAt } = parseFutureMeeting(body.startsAt, body.endsAt, 8);
  if (typeof body.locationType !== 'string' || !LOCATION_TYPES.includes(body.locationType as LocationType)) {
    throw new HttpError(400, `locationType must be one of ${LOCATION_TYPES.join(', ')}`);
  }
  const locationDetails = optionalText(body, 'locationDetails', 300);
  const note = optionalText(body, 'note', 1000);
  if (hasSessionConflict(req.demoUser!.id, startsAt, endsAt)) throw new HttpError(409, 'You already have a session at that time');
  transition(request.id, 'accepted', {
    proposed_starts_at: startsAt, proposed_ends_at: endsAt, proposed_location_type: body.locationType,
    proposed_location_details: locationDetails, tutor_note: note,
  });
  res.json({ request: loadRequest(request.id) } satisfies TutoringRequestResponse);
});

tutoringRequestsRouter.post('/:id/reject', (req, res) => {
  const request = asRole(req, 'tutor');
  requireStatus(request.status, ['open'], 'reject');
  const note = optionalText(req.body == null ? {} : bodyObject(req.body), 'note', 1000);
  transition(request.id, 'rejected', { tutor_note: note });
  res.json({ request: loadRequest(request.id) } satisfies TutoringRequestResponse);
});

tutoringRequestsRouter.post('/:id/cancel', (req, res) => {
  const request = asRole(req, 'student');
  requireStatus(request.status, ['open', 'accepted'], 'cancel');
  transition(request.id, 'cancelled');
  res.json({ request: loadRequest(request.id) } satisfies TutoringRequestResponse);
});

tutoringRequestsRouter.post('/:id/confirm', (req, res) => {
  const request = asRole(req, 'student');
  requireStatus(request.status, ['accepted'], 'confirm');
  const p = request.proposal;
  if (!p || request.tutorId === null || !request.tutor) throw new HttpError(409, 'Request has no proposed meeting to confirm');
  if (p.startsAt <= nowIso()) throw new HttpError(409, 'The proposed time has already passed; ask the tutor for a new proposal');
  if (hasSessionConflict(request.studentId, p.startsAt, p.endsAt) || hasSessionConflict(request.tutor.id, p.startsAt, p.endsAt)) {
    throw new HttpError(409, 'Someone involved now has another session at that time');
  }
  const db = getDb();
  let sessionId: number;
  db.exec('BEGIN');
  try {
    const now = nowIso();
    sessionId = Number(
      db.prepare(
        `INSERT INTO tutoring_sessions (request_id, course_id, tutor_id, student_id, starts_at, ends_at, location_type, location_details, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).run(request.id, request.courseId, request.tutorId, request.studentId, p.startsAt, p.endsAt, p.locationType, p.locationDetails, now, now).lastInsertRowid,
    );
    transition(request.id, 'confirmed');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  res.status(201).json({ request: loadRequest(request.id), session: loadSession(sessionId) } satisfies ConfirmTutoringRequestResponse);
});
