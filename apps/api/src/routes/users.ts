import { Router } from 'express';
import type { Enrollment, GetUserResponse, ListEnrollmentsResponse, ListUsersResponse, ApiError } from '@tunion/shared';
import { getDb } from '../db';
import { toUser } from '../mappers';
import { parseId } from '../http';
import { USER_SELECT, USER_VISIBLE } from '../userQueries';

export const usersRouter = Router();

usersRouter.get('/', (_req, res) => {
  const rows = getDb().prepare(`${USER_SELECT} WHERE ${USER_VISIBLE} ORDER BY u.id`).all();
  res.json({ users: rows.map(toUser) } satisfies ListUsersResponse);
});

usersRouter.get('/:id', (req, res) => {
  const row = getDb().prepare(`${USER_SELECT} WHERE u.id = ?`).get(Number(req.params.id));
  if (!row) return void res.status(404).json({ error: 'User not found' } satisfies ApiError);
  res.json({ user: toUser(row) } satisfies GetUserResponse);
});

// Reads the enrollments table (the imported data). Hidden users/courses still resolve so history is never lost.
usersRouter.get('/:id/enrollments', (req, res) => {
  const id = parseId(req.params.id, 'user id');
  const rows = getDb().prepare('SELECT course_id, status FROM enrollments WHERE user_id = ? ORDER BY course_id').all(id);
  res.json({ enrollments: rows.map((r) => ({ courseId: r.course_id as number, status: r.status as Enrollment['status'] })) } satisfies ListEnrollmentsResponse);
});
