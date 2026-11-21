import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ApiError } from '@tunion/shared';
import { DEMO_USER_HEADER } from '@tunion/shared';
import type { User } from '@tunion/shared';
import { getDb } from './db';
import { toUser } from './mappers';

/** Error carrying an HTTP status; converted to `{ error }` by the error handler. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

declare module 'express-serve-static-core' {
  interface Request {
    /** Demo user resolved from DEMO_USER_HEADER. DEMO AUTH ONLY - NOT SECURE. */
    demoUser?: User;
  }
}

/** Resolves the demo user from the header if present and valid. Never rejects. */
export const optionalDemoUser: RequestHandler = (req, _res, next) => {
  const id = Number(req.header(DEMO_USER_HEADER));
  if (Number.isInteger(id) && id > 0) {
    const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (row) req.demoUser = toUser(row);
  }
  next();
};

/** Requires a demo user (insecure, header-based). 401 otherwise. */
export const requireDemoUser: RequestHandler = (req, res, next) => {
  optionalDemoUser(req, res, () => {
    if (!req.demoUser) return next(new HttpError(401, 'Select a demo user (x-demo-user-id header required)'));
    next();
  });
};

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message } satisfies ApiError);
    return;
  }
  const e = err as { type?: string; status?: number };
  if (e?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON body' } satisfies ApiError);
    return;
  }
  if (e?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body too large' } satisfies ApiError);
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' } satisfies ApiError);
}

// ---------- input validation ----------

export function parseId(value: unknown, label = 'id'): number {
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isSafeInteger(n) || n < 1) throw new HttpError(400, `Invalid ${label}`);
  return n;
}

export function bodyObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(400, 'Request body must be a JSON object');
  return body as Record<string, unknown>;
}

export function str(obj: Record<string, unknown>, field: string, min: number, max: number): string {
  const v = obj[field];
  if (typeof v !== 'string') throw new HttpError(400, `${field} must be a string`);
  const t = v.trim();
  if (t.length < min || t.length > max) {
    throw new HttpError(400, `${field} must be ${min === max ? min : `${min}-${max}`} characters`);
  }
  return t;
}

/** Optional integer query parameter within [min, max]; returns fallback when absent. */
export function queryInt(value: unknown, label: string, min: number, max: number, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new HttpError(400, `Invalid ${label}`);
  const n = Number(value);
  if (n < min || n > max) throw new HttpError(400, `${label} must be between ${min} and ${max}`);
  return n;
}

export function queryString(value: unknown, label: string, max = 100): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new HttpError(400, `Invalid ${label}`);
  const t = value.trim();
  if (t.length > max) throw new HttpError(400, `${label} is too long`);
  return t || undefined;
}

/** Escapes LIKE wildcards so user input is matched literally (use with ESCAPE '\'). */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
