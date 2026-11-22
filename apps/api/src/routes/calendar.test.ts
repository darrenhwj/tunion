import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApi, type TestApi } from '../test/helpers';

// Seed sessions (dates relative to seeding day, JST):
//  tutoring 1: Alex <-> Sofia, 5 days ago, completed     tutoring 2: Priya <-> Marcus, +2d, scheduled
//  tutoring 3: Alex <-> Sofia, +4d, scheduled            tutoring 4: Alex <-> Marcus, +1d, cancelled
//  study 1,2: group 1 (Priya, Marcus) +1d/+8d            study 3: group 2 (Jordan, Alex) +3d
//  study 4: group 3 (Marcus, Priya, Sofia) +2d CANCELLED  study 5: group 4 (Priya only; CS102) +5d
const ids = (r: { json: { sessions: { id: number }[] } }) => r.json.sessions.map((s) => s.id);
const dayString = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

describe('calendar endpoints', () => {
  let api: TestApi;
  before(async () => { api = await startTestApi(); });
  after(() => api.close());

  describe('tutoring', () => {
    it('requires a demo user', async () => {
      assert.equal((await api.call('GET', '/api/calendar/tutoring')).status, 401);
      assert.equal((await api.call('GET', '/api/calendar/study-groups')).status, 401);
    });

    it('returns only the signed-in user\'s upcoming, non-cancelled sessions', async () => {
      assert.deepEqual(ids(await api.call('GET', '/api/calendar/tutoring', { user: 1 })), [3]);
      assert.deepEqual(ids(await api.call('GET', '/api/calendar/tutoring', { user: 2 })), [2]);
      assert.deepEqual(ids(await api.call('GET', '/api/calendar/tutoring', { user: 3 })), [2]); // tutors see theirs too
      assert.deepEqual(ids(await api.call('GET', '/api/calendar/tutoring', { user: 5 })), []);
    });

    it('filters by date range and status', async () => {
      const past = await api.call('GET', `/api/calendar/tutoring?from=${dayString(-30)}`, { user: 1 });
      assert.deepEqual(ids(past), [1, 3]); // ordered by start time
      const narrow = await api.call('GET', `/api/calendar/tutoring?from=${dayString(0)}&to=${dayString(2)}`, { user: 1 });
      assert.deepEqual(ids(narrow), []);
      const cancelled = await api.call('GET', `/api/calendar/tutoring?status=cancelled`, { user: 1 });
      assert.deepEqual(ids(cancelled), [4]);
      const completed = await api.call('GET', `/api/calendar/tutoring?from=${dayString(-30)}&status=completed`, { user: 1 });
      assert.deepEqual(ids(completed), [1]);
    });

    it('includes JST display fields and echoes the range', async () => {
      const r = await api.call('GET', '/api/calendar/tutoring?from=2020-01-01&to=2020-01-03', { user: 1 });
      assert.equal(r.json.range.from, '2019-12-31T15:00:00.000Z'); // date-only bounds are JST midnight
      assert.equal(r.json.range.fromJst, '2020-01-01T00:00:00.000+09:00');
      assert.equal(r.json.range.timeZone, 'Asia/Tokyo');
      const s = (await api.call('GET', '/api/calendar/tutoring', { user: 1 })).json.sessions[0];
      assert.ok(s.startsAt.endsWith('Z'));
      assert.ok(s.startsAtJst.endsWith('+09:00'));
      assert.equal(Date.parse(s.startsAt), Date.parse(s.startsAtJst));
      assert.equal(s.courseCode, 'CS330');
    });

    it('includes sessions that overlap the window edges', async () => {
      const s = (await api.call('GET', '/api/calendar/tutoring', { user: 1 })).json.sessions[0];
      const inside = new Date(Date.parse(s.startsAt) + 30 * 60_000).toISOString(); // mid-session
      const r = await api.call('GET', `/api/calendar/tutoring?from=${encodeURIComponent(inside)}&to=${encodeURIComponent(s.endsAt)}`, { user: 1 });
      assert.deepEqual(ids(r), [s.id]);
      const after = await api.call('GET', `/api/calendar/tutoring?from=${encodeURIComponent(s.endsAt)}`, { user: 1 });
      assert.deepEqual(ids(after), []); // ends exactly at the boundary: excluded
    });

    it('validates query parameters', async () => {
      for (const qs of ['from=garbage', 'from=2030-01-01T00:00:00', 'from=2030-02-01&to=2030-01-01', 'from=2030-01-01&to=2032-01-01', 'status=bogus']) {
        assert.equal((await api.call('GET', `/api/calendar/tutoring?${qs}`, { user: 1 })).status, 400, qs);
      }
    });

    it('reflects newly confirmed sessions', async () => {
      const mine = await api.call('GET', '/api/tutoring-requests?role=student', { user: 1 });
      for (const q of mine.json.requests as { id: number; tutorId: number; courseId: number; status: string }[]) {
        if (q.tutorId === 1 && q.courseId === 5 && (q.status === 'open' || q.status === 'accepted')) await api.call('POST', `/api/tutoring-requests/${q.id}/cancel`, { user: 1 });
      }
      const req = await api.call('POST', '/api/tutoring-requests', { user: 1, body: { courseId: 5, tutorId: 1, topic: 'Calendar check' } });
      const id = req.json.request.id;
      await api.call('POST', `/api/tutoring-requests/${id}/approve`, {
        user: 3, body: { startsAt: '2030-03-05T10:00:00+09:00', endsAt: '2030-03-05T11:00:00+09:00', locationType: 'online' },
      });
      assert.deepEqual(ids(await api.call('GET', '/api/calendar/tutoring?from=2030-03-01&to=2030-03-31', { user: 1 })), []); // only approved
      const confirm = await api.call('POST', `/api/tutoring-requests/${id}/confirm`, { user: 1 });
      const month = await api.call('GET', '/api/calendar/tutoring?from=2030-03-01&to=2030-03-31', { user: 1 });
      assert.deepEqual(ids(month), [confirm.json.session.id]);
      assert.deepEqual(ids(await api.call('GET', '/api/calendar/tutoring?from=2030-03-01&to=2030-03-31', { user: 2 })), []);
      await api.call('POST', `/api/tutoring-sessions/${confirm.json.session.id}/cancel`, { user: 1 });
      assert.deepEqual(ids(await api.call('GET', '/api/calendar/tutoring?from=2030-03-01&to=2030-03-31', { user: 1 })), []);
    });
  });

  describe('study groups', () => {
    it('returns scheduled sessions of groups the user belongs to', async () => {
      const alex = await api.call('GET', '/api/calendar/study-groups', { user: 1 });
      assert.deepEqual(ids(alex), [3]);
      assert.equal(alex.json.sessions[0].isMember, true);
      assert.equal(alex.json.sessions[0].groupName, 'Intro Programming Help Hour');
      assert.ok(alex.json.sessions[0].startsAtJst.endsWith('+09:00'));
      assert.deepEqual(ids(await api.call('GET', '/api/calendar/study-groups', { user: 2 })), [1, 5, 2]); // ordered by start time; cancelled #4 excluded
      assert.deepEqual(ids(await api.call('GET', '/api/calendar/study-groups', { user: 3 })), [1, 2]);
      assert.deepEqual(ids(await api.call('GET', '/api/calendar/study-groups', { user: 6 })), []);
    });

    it('filters by date range', async () => {
      const r = await api.call('GET', `/api/calendar/study-groups?from=${dayString(0)}&to=${dayString(3)}`, { user: 2 });
      assert.deepEqual(ids(r), [1]);
    });

    it('discover scope shows other groups in the user\'s courses with room', async () => {
      const r = await api.call('GET', '/api/calendar/study-groups?scope=discover', { user: 1 });
      assert.deepEqual(ids(r), [5]); // CS102 group; Alex is enrolled in CS102 but not a member
      assert.equal(r.json.sessions[0].isMember, false);
      // Priya already belongs to every group in her courses, so there is nothing to discover.
      assert.deepEqual(ids(await api.call('GET', '/api/calendar/study-groups?scope=discover', { user: 2 })), []);
    });

    it('discover scope hides groups that are full', async () => {
      const { getDb } = await import('../db');
      getDb().prepare('UPDATE study_groups SET max_members = 1 WHERE id = 4').run(); // group 4 already has 1 member
      assert.deepEqual(ids(await api.call('GET', '/api/calendar/study-groups?scope=discover', { user: 1 })), []);
      getDb().prepare('UPDATE study_groups SET max_members = 4 WHERE id = 4').run();
      assert.deepEqual(ids(await api.call('GET', '/api/calendar/study-groups?scope=discover', { user: 1 })), [5]);
      assert.equal((await api.call('GET', '/api/calendar/study-groups?scope=everything', { user: 1 })).status, 400);
    });
  });
});
