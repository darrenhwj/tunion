import express from 'express';
import cors from 'cors';
import type { ApiError, HealthResponse } from '@tunion/shared';
import { getDb } from './db';
import { usersRouter } from './routes/users';
import { coursesRouter } from './routes/courses';
import { demoAuthRouter } from './routes/demoAuth';

export function createApp() {
  const app = express();
  app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      service: 'tunion-api',
      time: new Date().toISOString(),
      database: 'error',
    };
    try {
      const db = getDb();
      const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
      body.database = 'ok';
      body.counts = { users: count('users'), courses: count('courses') };
    } catch (err) {
      console.error('Health check DB error:', err);
    }
    res.status(body.database === 'ok' ? 200 : 503).json(body);
  });

  app.use('/api/users', usersRouter);
  app.use('/api/courses', coursesRouter);
  app.use('/api', demoAuthRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' } satisfies ApiError);
  });
  return app;
}
