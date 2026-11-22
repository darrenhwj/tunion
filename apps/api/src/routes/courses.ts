import { Router } from 'express';
import type { GetCourseResponse, ListCoursesResponse, ListCourseMembersResponse, SetEnrollmentResponse, EnrollmentStatus, ApiError } from '@tunion/shared';
import { getDb } from '../db';
import { toCourse, toUser } from '../mappers';
import { HttpError, bodyObject, likePattern, parseId, queryString, requireDemoUser } from '../http';
import { USER_SELECT, USER_VISIBLE } from '../userQueries';

export const coursesRouter = Router();

// GET /api/courses?q=&level=
coursesRouter.get('/', (req, res) => {
  const q = queryString(req.query.q, 'q');
  const levelRaw = queryString(req.query.level, 'level', 3);
  if (levelRaw !== undefined && !['100', '200', '300', '400'].includes(levelRaw)) {
    throw new HttpError(400, 'level must be one of 100, 200, 300, 400');
  }
  const where: string[] = ['is_hidden = 0'];
  const params: Record<string, string | number> = {};
  if (q) {
    where.push("(code LIKE :q ESCAPE '\\' OR title LIKE :q ESCAPE '\\' OR description LIKE :q ESCAPE '\\')");
    params.q = likePattern(q);
  }
  if (levelRaw) {
    where.push('level = :level');
    params.level = Number(levelRaw);
  }
  const sql = `SELECT * FROM courses WHERE ${where.join(' AND ')} ORDER BY code`;
  const rows = getDb().prepare(sql).all(params);
  res.json({ courses: rows.map(toCourse) } satisfies ListCoursesResponse);
});

coursesRouter.get('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM courses WHERE id = ?').get(parseId(req.params.id, 'course id'));
  if (!row) return void res.status(404).json({ error: 'Course not found' } satisfies ApiError);
  res.json({ course: toCourse(row) } satisfies GetCourseResponse);
});

// Members come from the enrollments table. Hidden (legacy) accounts are not listed.
coursesRouter.get('/:id/members', (req, res) => {
  const id = parseId(req.params.id, 'course id');
  const rows = getDb().prepare(`${USER_SELECT} WHERE ${USER_VISIBLE} AND u.id IN (SELECT user_id FROM enrollments WHERE course_id = ?) ORDER BY u.id`).all(id);
  res.json({ members: rows.map(toUser) } satisfies ListCourseMembersResponse);
});

// The signed-in user (insecure demo auth) joins ('current') or leaves ('completed' keeps it as a past course). Never deletes rows.
coursesRouter.put('/:id/enrollment', requireDemoUser, (req, res) => {
  const id = parseId(req.params.id, 'course id');
  const status = bodyObject(req.body).status;
  if (status !== 'current' && status !== 'completed') throw new HttpError(400, "status must be 'current' or 'completed'");
  const db = getDb();
  if (!db.prepare('SELECT 1 FROM courses WHERE id = ? AND is_hidden = 0').get(id)) throw new HttpError(404, 'Course not found');
  db.prepare('INSERT INTO enrollments (user_id, course_id, status) VALUES (?,?,?) ON CONFLICT(user_id, course_id) DO UPDATE SET status = excluded.status')
    .run(req.demoUser!.id, id, status);
  res.json({ enrollment: { courseId: id, status: status as EnrollmentStatus } } satisfies SetEnrollmentResponse);
});
