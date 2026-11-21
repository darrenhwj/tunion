import { Router } from 'express';
import type { GetCourseResponse, ListCoursesResponse, ApiError } from '@tunion/shared';
import { getDb } from '../db';
import { toCourse } from '../mappers';

export const coursesRouter = Router();

coursesRouter.get('/', (_req, res) => {
  const rows = getDb().prepare('SELECT * FROM courses ORDER BY code').all();
  res.json({ courses: rows.map(toCourse) } satisfies ListCoursesResponse);
});

coursesRouter.get('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM courses WHERE id = ?').get(Number(req.params.id));
  if (!row) return void res.status(404).json({ error: 'Course not found' } satisfies ApiError);
  res.json({ course: toCourse(row) } satisfies GetCourseResponse);
});
