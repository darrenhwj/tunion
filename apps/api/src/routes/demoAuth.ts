import { Router } from 'express';
import { DEMO_USER_HEADER } from '@tunion/shared';
import type { ApiError, ListDemoAccountsResponse, MeResponse } from '@tunion/shared';
import { getDb } from '../db';
import { toUser } from '../mappers';
import { USER_SELECT, USER_VISIBLE } from '../userQueries';

// DEMO AUTHENTICATION ONLY. No passwords, no sessions, no security.
// Anyone can impersonate any user by sending a header. Never use in production.
export const demoAuthRouter = Router();

demoAuthRouter.get('/demo-auth/accounts', (_req, res) => {
  const rows = getDb().prepare(`${USER_SELECT} WHERE ${USER_VISIBLE} ORDER BY u.id`).all();
  res.json({ accounts: rows.map(toUser) } satisfies ListDemoAccountsResponse);
});

demoAuthRouter.get('/me', (req, res) => {
  const id = Number(req.header(DEMO_USER_HEADER));
  const row = Number.isInteger(id) ? getDb().prepare(`${USER_SELECT} WHERE u.id = ?`).get(id) : undefined;
  if (!row) return void res.status(401).json({ error: 'No demo user selected' } satisfies ApiError);
  res.json({ user: toUser(row) } satisfies MeResponse);
});
