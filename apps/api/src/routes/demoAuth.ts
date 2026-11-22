import { Router } from 'express';
import { DEMO_USER_HEADER } from '@tunion/shared';
import type { ApiError, ListDemoAccountsResponse, MeResponse } from '@tunion/shared';
import { getDb } from '../db';
import { toUser } from '../mappers';

// DEMO AUTHENTICATION ONLY. No passwords, no sessions, no security.
// Anyone can impersonate any user by sending a header. Never use in production.
export const demoAuthRouter = Router();

demoAuthRouter.get('/demo-auth/accounts', (_req, res) => {
  const rows = getDb().prepare('SELECT * FROM users WHERE is_hidden = 0 ORDER BY id').all();
  res.json({ accounts: rows.map(toUser) } satisfies ListDemoAccountsResponse);
});

demoAuthRouter.get('/me', (req, res) => {
  const id = Number(req.header(DEMO_USER_HEADER));
  const row = Number.isInteger(id) ? getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) : undefined;
  if (!row) return void res.status(401).json({ error: 'No demo user selected' } satisfies ApiError);
  res.json({ user: toUser(row) } satisfies MeResponse);
});
