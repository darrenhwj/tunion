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

/** Fetches a same-origin API URL with the insecure demo-user header. */
export async function apiResponse(url: string, init: RequestInit = {}) {
  if (!url.startsWith('/api/')) throw new Error('Invalid API URL');
  const headers = new Headers(init.headers);
  const id = getStoredDemoUserId();
  if (id !== null) headers.set(DEMO_USER_HEADER, String(id));
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as ApiError;
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiResponse('/api' + path, init);
  return res.json() as Promise<T>;
}

export function postJson<T>(path: string, payload: object) {
  return api<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
