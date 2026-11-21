import { Router } from 'express';
import type { GetUserResponse, ListUsersResponse, ApiError } from '@tunion/shared';
import { getDb } from '../db';
import { toUser } from '../mappers';

export const usersRouter = Router();

usersRouter.get('/', (_req, res) => {
  const rows = getDb().prepare('SELECT * FROM users ORDER BY id').all();
  res.json({ users: rows.map(toUser) } satisfies ListUsersResponse);
});

usersRouter.get('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!row) return void res.status(404).json({ error: 'User not found' } satisfies ApiError);
  res.json({ user: toUser(row) } satisfies GetUserResponse);
});
