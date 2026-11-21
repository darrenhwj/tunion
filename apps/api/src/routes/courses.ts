import { Router } from 'express';
import type { GetCourseResponse, ListCoursesResponse, ApiError } from '@tunion/shared';
import { getDb } from '../db';
import { toCourse } from '../mappers';
import { HttpError, likePattern, parseId, queryString } from '../http';

export const coursesRouter = Router();

// GET /api/courses?q=&level=
coursesRouter.get('/', (req, res) => {
  const q = queryString(req.query.q, 'q');
  const levelRaw = queryString(req.query.level, 'level', 3);
  if (levelRaw !== undefined && !['100', '200', '300', '400'].includes(levelRaw)) {
    throw new HttpError(400, 'level must be one of 100, 200, 300, 400');
  }
  const where: string[] = [];
  const params: Record<string, string | number> = {};
  if (q) {
    where.push("(code LIKE :q ESCAPE '\\' OR title LIKE :q ESCAPE '\\' OR description LIKE :q ESCAPE '\\')");
    params.q = likePattern(q);
  }
  if (levelRaw) {
    where.push('level = :level');
    params.level = Number(levelRaw);
  }
  const sql = `SELECT * FROM courses ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY code`;
  const rows = getDb().prepare(sql).all(params);
  res.json({ courses: rows.map(toCourse) } satisfies ListCoursesResponse);
});

coursesRouter.get('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM courses WHERE id = ?').get(parseId(req.params.id, 'course id'));
  if (!row) return void res.status(404).json({ error: 'Course not found' } satisfies ApiError);
  res.json({ course: toCourse(row) } satisfies GetCourseResponse);
});
