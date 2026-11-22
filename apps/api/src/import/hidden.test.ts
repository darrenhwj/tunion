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

  it('also hides them from the tutor directory and People list, blocks new requests, and keeps admin and history', async () => {
    const { getDb } = await import('../db');
    const db = getDb();
    const ids = async (path: string) => (await api.call('GET', path)).json.tutors.map((t: { id: number }) => t.id);
    assert.deepEqual(await ids('/api/tutors'), [1, 2]);
    db.exec('UPDATE users SET is_hidden = 1 WHERE id = 4'); // hidden legacy account that is tutor 2
    assert.deepEqual(await ids('/api/tutors'), [1]);
    assert.deepEqual(await ids('/api/tutors?courseId=8'), []);
    const people = await api.call('GET', '/api/users');
    assert.ok(!people.json.users.some((u: { id: number }) => u.id === 4));
    // Historical references still resolve.
    assert.equal((await api.call('GET', '/api/tutors/2')).status, 200);
    assert.equal((await api.call('GET', '/api/users/4')).status, 200);
    const blocked = await api.call('POST', '/api/tutoring-requests', { user: 2, body: { courseId: 8, tutorId: 2, topic: 'SQL joins' } });
    assert.equal(blocked.status, 400);
    assert.match(blocked.json.error, /no longer available/);

    // A revoked badge (is_active = 0) behaves the same way, and also removes tutor-only powers.
    db.exec('UPDATE tutors SET is_active = 0 WHERE id = 1');
    assert.deepEqual(await ids('/api/tutors'), []);
    assert.equal((await api.call('GET', '/api/tutors/me/availability', { user: 3 })).status, 403);
    assert.equal((await api.call('POST', '/api/tutoring-requests', { user: 1, body: { courseId: 3, tutorId: 1, topic: 'Tree traversals' } })).status, 400);
    assert.equal((await api.call('GET', '/api/tutoring-requests?role=tutor', { user: 3 })).status, 200); // history stays visible
    assert.equal((await api.call('GET', '/api/tutors/1')).status, 200);

    // Admin can never be hidden out of the selector.
    db.exec('UPDATE users SET is_hidden = 1 WHERE id = 6');
    const accounts = await api.call('GET', '/api/demo-auth/accounts');
    assert.ok(accounts.json.accounts.some((a: { id: number }) => a.id === 6));
    assert.ok(!accounts.json.accounts.some((a: { id: number }) => a.id === 4));
    db.exec('UPDATE users SET is_hidden = 0 WHERE id IN (4, 6); UPDATE tutors SET is_active = 1');
  });
});
