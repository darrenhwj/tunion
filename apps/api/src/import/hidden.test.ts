import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApi, type TestApi } from '../test/helpers';

describe('hidden legacy records', () => {
  let api: TestApi;
  before(async () => { api = await startTestApi(); });
  after(() => api.close());

  it('are removed from the account selector and course directory but remain reachable', async () => {
    const { getDb } = await import('../db');
    getDb().exec("UPDATE users SET is_hidden = 1 WHERE id = 1; UPDATE courses SET is_hidden = 1 WHERE code = 'CS101'");
    const accounts = await api.call('GET', '/api/demo-auth/accounts');
    assert.ok(!accounts.json.accounts.some((a: { id: number }) => a.id === 1));
    assert.equal(accounts.json.accounts.length, 5);
    const courses = await api.call('GET', '/api/courses');
    assert.ok(!courses.json.courses.some((c: { code: string }) => c.code === 'CS101'));
    assert.equal((await api.call('GET', '/api/courses?q=CS101')).json.courses.length, 0);
    // Content and direct lookups still work, so old posts keep their authors.
    assert.equal((await api.call('GET', '/api/courses/1')).status, 200);
    assert.equal((await api.call('GET', '/api/me', { user: 1 })).status, 200);
  });
});
