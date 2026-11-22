import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApi, type TestApi } from '../test/helpers';

describe('enrollments and tutor flag come from the database', () => {
  let api: TestApi;
  before(async () => { api = await startTestApi(); });
  after(() => api.close());

  it('reports isTutor from the active tutor badge, not from role', async () => {
    const { getDb } = await import('../db');
    const db = getDb();
    db.exec("UPDATE users SET role = 'student' WHERE id = 3"); // an imported tutor is role 'student' with a tutors row
    const flag = async (id: number) => (await api.call('GET', '/api/demo-auth/accounts')).json.accounts.find((a: { id: number }) => a.id === id).isTutor;
    assert.equal(await flag(3), true);
    assert.equal(await flag(1), false);
    assert.equal((await api.call('GET', '/api/me', { user: 3 })).json.user.isTutor, true);
    db.exec('UPDATE tutors SET is_active = 0 WHERE user_id = 3');
    assert.equal(await flag(3), false);
    db.exec('UPDATE tutors SET is_active = 1 WHERE user_id = 3');
  });

  it('lists a user\'s enrollments and a course\'s visible members from the enrollments table', async () => {
    const { getDb } = await import('../db');
    const db = getDb();
    db.exec("INSERT OR REPLACE INTO enrollments (user_id, course_id, status) VALUES (1, 4, 'completed')");
    const mine = (await api.call('GET', '/api/users/1/enrollments')).json.enrollments;
    assert.deepEqual(mine.find((e: { courseId: number }) => e.courseId === 4), { courseId: 4, status: 'completed' });
    const before = (await api.call('GET', '/api/courses/4/members')).json.members.map((m: { id: number }) => m.id);
    assert.ok(before.includes(1));
    db.exec('UPDATE users SET is_hidden = 1 WHERE id = 1');
    assert.ok(!(await api.call('GET', '/api/courses/4/members')).json.members.some((m: { id: number }) => m.id === 1));
    assert.equal((await api.call('GET', '/api/users/1/enrollments')).status, 200); // history still resolves
    db.exec('UPDATE users SET is_hidden = 0 WHERE id = 1');
  });

  it('lets the signed-in user join and leave (leave keeps a past-course record), and validates input', async () => {
    const put = (user: number | undefined, id: number, body: unknown) => api.call('PUT', `/api/courses/${id}/enrollment`, { user, body });
    assert.equal((await put(undefined, 6, { status: 'current' })).status, 401);
    assert.equal((await put(1, 6, { status: 'nope' })).status, 400);
    assert.equal((await put(1, 999, { status: 'current' })).status, 404);
    assert.deepEqual((await put(1, 6, { status: 'current' })).json.enrollment, { courseId: 6, status: 'current' });
    assert.deepEqual((await put(1, 6, { status: 'completed' })).json.enrollment, { courseId: 6, status: 'completed' });
    const rows = (await api.call('GET', '/api/users/1/enrollments')).json.enrollments.filter((e: { courseId: number }) => e.courseId === 6);
    assert.deepEqual(rows, [{ courseId: 6, status: 'completed' }]);
    const { getDb } = await import('../db');
    getDb().exec('UPDATE courses SET is_hidden = 1 WHERE id = 7');
    assert.equal((await put(1, 7, { status: 'current' })).status, 404); // hidden courses cannot be joined
  });
});
