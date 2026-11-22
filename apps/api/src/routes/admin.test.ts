import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApi, type TestApi } from '../test/helpers';

// Seed: user 6 = admin (Hani Karam); 1, 2 students; 3, 4 tutors (tutor ids 1, 2); 5 TA. Discussions 1-6 by users 1-4.
describe('admin moderation', () => {
  let api: TestApi;
  before(async () => { api = await startTestApi(); });
  after(() => api.close());
  const names = (r: { json: { users?: { id: number; name: string }[]; accounts?: { id: number; name: string }[] } }) =>
    Object.fromEntries((r.json.users ?? r.json.accounts ?? []).map((u) => [u.id, u.name]));

  describe('admin account name', () => {
    it('shows Hani Karam everywhere the account is listed, with the id and role preserved', async () => {
      const accounts = await api.call('GET', '/api/demo-auth/accounts');
      assert.equal(names(accounts)[6], 'Hani Karam');
      assert.equal(names(await api.call('GET', '/api/users'))[6], 'Hani Karam');
      const profile = await api.call('GET', '/api/users/6');
      assert.deepEqual([profile.json.user.name, profile.json.user.role], ['Hani Karam', 'admin']);
      assert.equal((await api.call('GET', '/api/me', { user: 6 })).json.user.name, 'Hani Karam');
      assert.equal(Object.values(names(accounts)).filter((n) => n === 'Dana Whitfield').length, 0);
      assert.equal((accounts.json.accounts as { role: string }[]).filter((a) => a.role === 'admin').length, 1);
    });
  });

  describe('deleting discussions', () => {
    it('lets the admin soft-delete any post, hiding it from feeds and direct links', async () => {
      const before = (await api.call('GET', '/api/discussions')).json.discussions.length;
      const del = await api.call('DELETE', '/api/admin/discussions/2', { user: 6 }); // Priya's post, which has replies and votes
      assert.deepEqual(del.json, { deleted: true, id: 2 });
      const feed = (await api.call('GET', '/api/discussions')).json.discussions;
      assert.equal(feed.length, before - 1);
      assert.ok(!feed.some((d: { id: number }) => d.id === 2));
      assert.ok(!(await api.call('GET', '/api/discussions?courseId=3')).json.discussions.some((d: { id: number }) => d.id === 2));
      const direct = await api.call('GET', '/api/discussions/2');
      assert.equal(direct.status, 410);
      assert.match(direct.json.error, /deleted/);
      assert.equal((await api.call('DELETE', '/api/admin/discussions/2', { user: 6 })).status, 410);
      assert.equal((await api.call('DELETE', '/api/admin/discussions/999', { user: 6 })).status, 404);
    });

    it('keeps replies, votes, the author and the course; deleted posts accept no new activity', async () => {
      const gone = await api.call('POST', '/api/discussions/2/replies', { user: 1, body: { body: 'hello' } });
      assert.equal(gone.status, 410);
      assert.equal((await api.call('POST', '/api/discussions/2/upvote', { user: 1 })).status, 404);
      assert.equal((await api.call('GET', '/api/discussions/1')).status, 200); // others untouched
      assert.equal((await api.call('GET', '/api/users/2')).status, 200);
      assert.equal((await api.call('GET', '/api/courses/3')).status, 200);
      const { getDb } = await import('../db');
      const n = (sql: string) => (getDb().prepare(sql).get() as { n: number }).n;
      assert.equal(n('SELECT COUNT(*) n FROM discussions'), 6); // soft delete: the row is still there
      assert.equal(n('SELECT COUNT(*) n FROM replies WHERE discussion_id = 2'), 2);
      assert.equal(n('SELECT COUNT(*) n FROM discussion_votes WHERE discussion_id = 2'), 2);
      assert.equal(n('SELECT COUNT(*) n FROM replies'), 10);
    });

    it('rejects everyone who is not an admin', async () => {
      assert.equal((await api.call('DELETE', '/api/admin/discussions/3')).status, 401);
      for (const user of [1, 2, 3, 4, 5]) {
        assert.equal((await api.call('DELETE', '/api/admin/discussions/3', { user })).status, 403, `user ${user}`); // incl. author (1..3), tutors, TA
      }
      assert.equal((await api.call('GET', '/api/discussions/3')).status, 200);
    });
  });

  describe('tutor badges', () => {
    it('lets only the admin grant or revoke, and nobody can do it for themselves', async () => {
      const put = (user: number | undefined, id: number, isTutor: boolean) => api.call('PUT', `/api/admin/users/${id}/tutor-badge`, { user, body: { isTutor } });
      assert.equal((await put(undefined, 1, true)).status, 401);
      assert.equal((await put(1, 1, true)).status, 403); // self-grant
      assert.equal((await put(2, 1, true)).status, 403);
      assert.equal((await put(3, 4, false)).status, 403); // a tutor revoking another tutor
      assert.equal((await put(5, 5, true)).status, 403);
      assert.equal((await api.call('GET', '/api/admin/users/3/tutor-impact', { user: 3 })).status, 403);
      assert.equal((await api.call('GET', '/api/users/1')).json.user.isTutor, false);
      assert.equal((await api.call('GET', '/api/users/4')).json.user.isTutor, true);
    });

    it('validates the request and never touches admin accounts or roles', async () => {
      const put = (id: number | string, body: unknown) => api.call('PUT', `/api/admin/users/${id}/tutor-badge`, { user: 6, body });
      assert.equal((await put(1, {})).status, 400);
      assert.equal((await put(1, { isTutor: 'yes' })).status, 400);
      assert.equal((await put(999, { isTutor: true })).status, 404);
      assert.equal((await put('x', { isTutor: true })).status, 400);
      assert.equal((await put(6, { isTutor: false })).status, 400); // admin target
      assert.equal((await api.call('GET', '/api/users/6')).json.user.role, 'admin');
    });

    it('grants a badge: shows everywhere, keeps the Student role, starts with no subjects', async () => {
      const grant = await api.call('PUT', '/api/admin/users/1/tutor-badge', { user: 6, body: { isTutor: true } });
      assert.equal(grant.status, 200);
      assert.equal(grant.json.user.isTutor, true);
      assert.equal(grant.json.user.role, 'student');
      assert.deepEqual(grant.json.impact, { openRequests: [], upcomingSessions: [] });
      const grantAgain = await api.call('PUT', '/api/admin/users/1/tutor-badge', { user: 6, body: { isTutor: true } }); // idempotent
      assert.equal(grantAgain.status, 200);
      const { getDb } = await import('../db');
      assert.equal((getDb().prepare('SELECT COUNT(*) n FROM tutors WHERE user_id = 1').get() as { n: number }).n, 1);
      const find = (list: { id: number; isTutor: boolean }[]) => list.find((u) => u.id === 1)?.isTutor;
      assert.equal(find((await api.call('GET', '/api/users')).json.users), true);
      assert.equal(find((await api.call('GET', '/api/demo-auth/accounts')).json.accounts), true);
      assert.equal((await api.call('GET', '/api/me', { user: 1 })).json.user.isTutor, true);
      const listed = (await api.call('GET', '/api/tutors')).json.tutors as { userId: number; courseIds: number[]; slots: unknown[] }[];
      const mine = listed.find((t) => t.userId === 1);
      assert.deepEqual([mine?.courseIds, mine?.slots], [[], []]); // listed, but no inferred subjects or hours
      // The new tutor can now use tutor settings.
      assert.equal((await api.call('PUT', '/api/tutors/me/subjects', { user: 1, body: { courseIds: [1] } })).status, 200);
      assert.equal((await api.call('POST', '/api/tutors/me/availability', { user: 1, body: { dayOfWeek: 1, startTime: '09:00', endTime: '10:00', locationType: 'online' } })).status, 201);
    });

    it('reports outstanding work when revoking, keeps history, and blocks new bookings', async () => {
      // Tutor 1 (Marcus, user 3) has open/accepted requests and upcoming sessions in the seed.
      const preview = await api.call('GET', '/api/admin/users/3/tutor-impact', { user: 6 });
      assert.equal(preview.status, 200);
      const { getDb } = await import('../db');
      const dbCount = (sql: string) => (getDb().prepare(sql).get() as { n: number }).n;
      const sessionsBefore = dbCount('SELECT COUNT(*) n FROM tutoring_sessions');
      const requestsBefore = dbCount('SELECT COUNT(*) n FROM tutoring_requests');
      const open = dbCount("SELECT COUNT(*) n FROM tutoring_requests WHERE tutor_id = 1 AND status IN ('open','accepted')");
      assert.equal(preview.json.impact.openRequests.length, open);
      assert.ok(open > 0);

      const revoke = await api.call('PUT', '/api/admin/users/3/tutor-badge', { user: 6, body: { isTutor: false } });
      assert.equal(revoke.status, 200);
      assert.equal(revoke.json.user.isTutor, false);
      assert.equal(revoke.json.user.role, 'tutor'); // role column untouched (legacy seed value); only the badge changed
      assert.equal(revoke.json.impact.openRequests.length, open);
      assert.equal(dbCount('SELECT COUNT(*) n FROM tutoring_sessions'), sessionsBefore); // history intact
      assert.equal(dbCount('SELECT COUNT(*) n FROM tutoring_requests'), requestsBefore);
      assert.equal(dbCount('SELECT COUNT(*) n FROM tutors WHERE user_id = 3'), 1);
      assert.equal(dbCount("SELECT COUNT(*) n FROM tutoring_requests WHERE tutor_id = 1 AND status IN ('open','accepted')"), open); // not auto-cancelled

      assert.ok(!(await api.call('GET', '/api/tutors')).json.tutors.some((t: { userId: number }) => t.userId === 3));
      assert.equal((await api.call('GET', '/api/users/3')).json.user.isTutor, false);
      assert.equal((await api.call('GET', '/api/demo-auth/accounts')).json.accounts.find((a: { id: number }) => a.id === 3).isTutor, false);
      const booking = await api.call('POST', '/api/tutoring-requests', { user: 2, body: { courseId: 3, tutorId: 1, topic: 'After revoke' } });
      assert.equal(booking.status, 400);
      assert.equal((await api.call('GET', '/api/tutors/me', { user: 3 })).status, 403);
      // Existing requests can still be answered, so students are not left hanging.
      const pending = (getDb().prepare("SELECT id FROM tutoring_requests WHERE tutor_id = 1 AND status = 'open' LIMIT 1").get() as { id: number } | undefined)?.id;
      if (pending) assert.equal((await api.call('POST', `/api/tutoring-requests/${pending}/reject`, { user: 3, body: { note: 'No longer tutoring' } })).status, 200);

      // Re-granting restores the old profile (subjects and availability).
      const regrant = await api.call('PUT', '/api/admin/users/3/tutor-badge', { user: 6, body: { isTutor: true } });
      assert.equal(regrant.json.user.isTutor, true);
      assert.deepEqual((await api.call('GET', '/api/tutors/me', { user: 3 })).json.tutor.courseIds, [3, 5, 7]);
    });
  });
});
