import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DEMO_USER_HEADER } from '@tunion/shared';

export interface TestApi {
  call: (method: string, path: string, opts?: { user?: number; body?: unknown; form?: FormData }) => Promise<{ status: number; json: any }>;
  /** Like call() but returns the raw Response (for binary downloads and header checks). */
  raw: (method: string, path: string, opts?: { user?: number }) => Promise<Response>;
  close: () => Promise<void>;
}

/** Boots the app on an ephemeral port against a throwaway, freshly seeded SQLite file. */
export async function startTestApi(): Promise<TestApi> {
  const dir = mkdtempSync(join(tmpdir(), 'tunion-test-'));
  process.env.DATABASE_PATH = join(dir, 'test.db');
  await import('../db/seed'); // deterministic fixed-ID demo data
  const { createApp } = await import('../app');
  const { closeDb } = await import('../db');
  const server: Server = await new Promise((resolve) => {
    const s = createApp().listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    async call(method, path, opts = {}) {
      const headers: Record<string, string> = {};
      if (opts.user !== undefined) headers[DEMO_USER_HEADER] = String(opts.user);
      if (opts.body !== undefined) headers['content-type'] = 'application/json';
      const res = await fetch(base + path, {
        method,
        headers,
        body: opts.form ?? (typeof opts.body === 'string' ? opts.body : opts.body === undefined ? undefined : JSON.stringify(opts.body)),
      });
      return { status: res.status, json: await res.json() };
    },
    async raw(method, path, opts = {}) {
      const headers: Record<string, string> = {};
      if (opts.user !== undefined) headers[DEMO_USER_HEADER] = String(opts.user);
      return fetch(base + path, { method, headers });
    },
    async close() {
      await new Promise((r) => server.close(r));
      closeDb();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
