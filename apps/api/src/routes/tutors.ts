import { Router } from 'express';
import type {
  AvailabilitySlot, CreateAvailabilitySlotResponse, DeleteResponse, GetTutorResponse, ListAvailabilityResponse,
  ListTutorsResponse, LocationType, UpdateAvailabilitySlotResponse,
} from '@tunion/shared';
import { LOCATION_TYPES } from '@tunion/shared';
import { getDb } from '../db';
import { toSlot, toTutorProfile } from '../mappers';
import { HttpError, bodyObject, parseId, requireDemoUser } from '../http';
import { tutorIdForUser } from '../tutoring';

export const tutorsRouter = Router();

const TUTOR_SELECT = `SELECT t.*, u.name AS user_name, u.role AS user_role FROM tutors t JOIN users u ON u.id = t.user_id`;
const SLOT_ORDER = 'ORDER BY day_of_week, start_time, id';
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function profiles(where: string, params: Record<string, number>) {
  const db = getDb();
  return db.prepare(`${TUTOR_SELECT} ${where} ORDER BY t.id`).all(params).map((row) => {
    const id = row.id as number;
    const courseIds = (db.prepare('SELECT course_id FROM tutor_courses WHERE tutor_id = ? ORDER BY course_id').all(id) as { course_id: number }[]).map((c) => c.course_id);
    const slots = db.prepare(`SELECT * FROM tutor_availability_slots WHERE tutor_id = ? ${SLOT_ORDER}`).all(id).map(toSlot);
    return toTutorProfile(row, courseIds, slots);
  });
}

/** Validates the full slot shape (used for create, and for the merged result of a PATCH). */
function validateSlot(v: Record<string, unknown>): Pick<AvailabilitySlot, 'dayOfWeek' | 'startTime' | 'endTime' | 'locationType'> {
  const day = v.dayOfWeek;
  if (typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6) throw new HttpError(400, 'dayOfWeek must be an integer 0 (Sunday) to 6 (Saturday)');
  for (const f of ['startTime', 'endTime'] as const) {
    if (typeof v[f] !== 'string' || !TIME.test(v[f] as string)) throw new HttpError(400, `${f} must be HH:MM in 24-hour time`);
  }
  if ((v.endTime as string) <= (v.startTime as string)) throw new HttpError(400, 'endTime must be after startTime');
  if (typeof v.locationType !== 'string' || !LOCATION_TYPES.includes(v.locationType as LocationType)) {
    throw new HttpError(400, `locationType must be one of ${LOCATION_TYPES.join(', ')}`);
  }
  return { dayOfWeek: day as AvailabilitySlot['dayOfWeek'], startTime: v.startTime as string, endTime: v.endTime as string, locationType: v.locationType as LocationType };
}

function assertNoOverlap(tutorId: number, s: { dayOfWeek: number; startTime: string; endTime: string }, excludeId: number) {
  const clash = getDb()
    .prepare(`SELECT 1 FROM tutor_availability_slots WHERE tutor_id = :t AND day_of_week = :d AND id != :x AND start_time < :e AND end_time > :s`)
    .get({ t: tutorId, d: s.dayOfWeek, x: excludeId, e: s.endTime, s: s.startTime });
  if (clash) throw new HttpError(409, 'This slot overlaps another of your slots on the same day');
}

function myTutorId(userId: number): number {
  const id = tutorIdForUser(userId);
  if (id === undefined) throw new HttpError(403, 'You do not have a tutor profile');
  return id;
}

/** Loads a slot and enforces that it belongs to the signed-in tutor. */
function ownSlot(tutorId: number, slotId: number) {
  const row = getDb().prepare('SELECT * FROM tutor_availability_slots WHERE id = ?').get(slotId);
  if (!row) throw new HttpError(404, 'Availability slot not found');
  if (row.tutor_id !== tutorId) throw new HttpError(403, 'You can only change your own availability');
  return toSlot(row);
}

// ---- own availability (declared before /:id so "me" is not parsed as an id) ----

tutorsRouter.get('/me/availability', requireDemoUser, (req, res) => {
  const tutorId = myTutorId(req.demoUser!.id);
  const rows = getDb().prepare(`SELECT * FROM tutor_availability_slots WHERE tutor_id = ? ${SLOT_ORDER}`).all(tutorId);
  res.json({ slots: rows.map(toSlot) } satisfies ListAvailabilityResponse);
});

tutorsRouter.post('/me/availability', requireDemoUser, (req, res) => {
  const tutorId = myTutorId(req.demoUser!.id);
  const slot = validateSlot(bodyObject(req.body));
  assertNoOverlap(tutorId, slot, 0);
  const { lastInsertRowid } = getDb()
    .prepare('INSERT INTO tutor_availability_slots (tutor_id, day_of_week, start_time, end_time, location_type, created_at) VALUES (?,?,?,?,?,?)')
    .run(tutorId, slot.dayOfWeek, slot.startTime, slot.endTime, slot.locationType, new Date().toISOString());
  res.status(201).json({ slot: ownSlot(tutorId, Number(lastInsertRowid)) } satisfies CreateAvailabilitySlotResponse);
});

tutorsRouter.patch('/me/availability/:slotId', requireDemoUser, (req, res) => {
  const tutorId = myTutorId(req.demoUser!.id);
  const slotId = parseId(req.params.slotId, 'slot id');
  const current = ownSlot(tutorId, slotId);
  const body = bodyObject(req.body);
  const fields = ['dayOfWeek', 'startTime', 'endTime', 'locationType'] as const;
  if (!fields.some((f) => body[f] !== undefined)) throw new HttpError(400, 'Provide at least one field to update');
  const merged = validateSlot({ ...current, ...Object.fromEntries(fields.filter((f) => body[f] !== undefined).map((f) => [f, body[f]])) });
  assertNoOverlap(tutorId, merged, slotId);
  getDb()
    .prepare('UPDATE tutor_availability_slots SET day_of_week = ?, start_time = ?, end_time = ?, location_type = ? WHERE id = ?')
    .run(merged.dayOfWeek, merged.startTime, merged.endTime, merged.locationType, slotId);
  res.json({ slot: ownSlot(tutorId, slotId) } satisfies UpdateAvailabilitySlotResponse);
});

tutorsRouter.delete('/me/availability/:slotId', requireDemoUser, (req, res) => {
  const tutorId = myTutorId(req.demoUser!.id);
  const slotId = parseId(req.params.slotId, 'slot id');
  ownSlot(tutorId, slotId);
  getDb().prepare('DELETE FROM tutor_availability_slots WHERE id = ?').run(slotId);
  res.json({ deleted: true, id: slotId } satisfies DeleteResponse);
});

// ---- public reads ----

tutorsRouter.get('/', (req, res) => {
  const courseId = req.query.courseId === undefined ? undefined : parseId(req.query.courseId, 'courseId');
  const list = courseId === undefined
    ? profiles('', {})
    : profiles('WHERE t.id IN (SELECT tutor_id FROM tutor_courses WHERE course_id = :courseId)', { courseId });
  res.json({ tutors: list } satisfies ListTutorsResponse);
});

tutorsRouter.get('/:id', (req, res) => {
  const [tutor] = profiles('WHERE t.id = :id', { id: parseId(req.params.id, 'tutor id') });
  if (!tutor) throw new HttpError(404, 'Tutor not found');
  res.json({ tutor } satisfies GetTutorResponse);
});
