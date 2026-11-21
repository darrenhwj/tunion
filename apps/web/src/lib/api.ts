import { DEMO_USER_HEADER } from '@tunion/shared';
import type { ApiError } from '@tunion/shared';

const DEMO_USER_KEY = 'tunion.demoUserId';

export function getStoredDemoUserId(): number | null {
  const v = localStorage.getItem(DEMO_USER_KEY);
  return v ? Number(v) : null;
}

export function storeDemoUserId(id: number | null): void {
  if (id === null) localStorage.removeItem(DEMO_USER_KEY);
  else localStorage.setItem(DEMO_USER_KEY, String(id));
}

/** Typed fetch wrapper. Attaches the (insecure) demo-user header when set. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const id = getStoredDemoUserId();
  if (id !== null) headers.set(DEMO_USER_HEADER, String(id));
  const res = await fetch(`/api${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as ApiError).error ?? `Request failed (${res.status})`);
  return body as T;
}

export function postJson<T>(path: string, payload: object) {
  return api<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
