import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApi, type TestApi } from '../test/helpers';

// Seed one-time sessions (dates relative to the seeding day, JST):
//  1 CS201 "Midterm review" by Priya(2), +2d, max 8, participants [2,3]     2 CS101 "Pointers Q&A" by Jordan(5), +3d, [5,1]
//  3 CS330 "SQL join workshop" by Sofia(4), +6d, max 2 (FULL), [4,2]        4 CS201 cancelled, by Priya, +1d
// Users: 1 Alex (enrolled CS101, CS102), 2 Priya (CS201, CS202, CS102), 4 Sofia (CS330, CS350 per enrollments 4->8,10), 3 Marcus.
const ids = (r: { json: { sessions: { id: number }[] } }) => r.json.sessions.map((s) => s.id);
const oneTimeIds = (r: { json: { oneTimeSessions: { id: number }[] } }) => r.json.oneTimeSessions.map((s) => s.id);
const WINDOW = 'from=2030-06-01&to=2030-06-30';

describe('one-time study sessions', () => {
  let api: TestApi;
  before(async () => { api = await startTestApi(); });
  after(() => api.close());

  const body = {
    courseId: 1, title: 'Loops office hour', description: 'Bring your lab 3 questions.',
    startsAt: '2030-06-10T16:00:00+09:00', endsAt: '2030-06-10T17:30:00+09:00', location: 'Library Room 1A', maxParticipants: 4,
  };
  let created: number;

  describe('creation and persistence', () => {
    it('creates a standalone session without any study group, and auto-joins the creator', async () => {
      const { getDb } = await import('../db');
      const groupsBefore = (getDb().prepare('SELECT COUNT(*) AS n FROM study_groups').get() as { n: number }).n;
      const r = await api.call('POST', '/api/one-time-sessions', { user: 1, body });
      assert.equal(r.status, 201, JSON.stringify(r.json));
      const s = r.json.session;
      created = s.id;
      assert.equal(s.courseId, 1);
      assert.equal(s.courseCode, 'CS101');
      assert.equal(s.title, 'Loops office hour');
      assert.equal(s.description, 'Bring your lab 3 questions.');
      assert.equal(s.location, 'Library Room 1A');
      assert.equal(s.startsAt, '2030-06-10T07:00:00.000Z');
      assert.equal(s.startsAtJst, '2030-06-10T16:00:00.000+09:00');
      assert.equal(s.timeZone, 'Asia/Tokyo');
      assert.equal(s.creator.id, 1);
      assert.equal(s.isCreator, true);
      assert.equal(s.isParticipant, true);
      assert.equal(s.participantCount, 1);
      assert.deepEqual(s.participants.map((p: { id: number }) => p.id), [1]);
      assert.equal(s.maxParticipants, 4);
      assert.equal(s.status, 'scheduled');
      assert.equal((getDb().prepare('SELECT COUNT(*) AS n FROM study_groups').get() as { n: number }).n, groupsBefore);
    });

    it('persists to SQLite and is readable by anyone', async () => {
      const { getDb } = await import('../db');
      const row = getDb().prepare('SELECT * FROM one_time_sessions WHERE id = ?').get(created) as Record<string, unknown>;
      assert.equal(row.creator_id, 1);
      assert.equal(row.starts_at, '2030-06-10T07:00:00.000Z');
      assert.equal((getDb().prepare('SELECT COUNT(*) AS n FROM one_time_session_participants WHERE session_id = ?').get(created) as { n: number }).n, 1);
      const anon = await api.call('GET', `/api/one-time-sessions/${created}`);
      assert.equal(anon.json.session.title, 'Loops office hour');
      assert.equal(anon.json.session.isParticipant, false);
      assert.equal(anon.json.session.isCreator, false);
      assert.equal((await api.call('GET', `/api/one-time-sessions/${created}`, { user: 1 })).json.session.isCreator, true);
    });

    it('applies defaults', async () => {
      const r = await api.call('POST', '/api/one-time-sessions', {
        user: 2, body: { courseId: 3, title: 'Minimal session', startsAt: body.startsAt, endsAt: body.endsAt, location: 'CS Lounge' },
      });
      assert.equal(r.status, 201);
      assert.equal(r.json.session.maxParticipants, 10);
      assert.equal(r.json.session.description, '');
    });

    it('validates input and access', async () => {
      const post = (user: number | undefined, b: unknown) => api.call('POST', '/api/one-time-sessions', { user, body: b });
      assert.equal((await post(undefined, body)).status, 401);
      assert.equal((await post(999, body)).status, 401);
      const bad: Record<string, unknown>[] = [
        { ...body, title: 'ab' }, { ...body, title: 'x'.repeat(201) }, { ...body, location: '' }, { ...body, location: '  ' },
        { ...body, description: 'x'.repeat(2001) }, { ...body, courseId: 'one' }, { ...body, courseId: undefined },
        { ...body, startsAt: '2030-06-10T16:00:00' }, { ...body, endsAt: '2030-06-10T15:00:00+09:00' },
        { ...body, startsAt: '2020-06-10T16:00:00+09:00', endsAt: '2020-06-10T17:00:00+09:00' },
        { ...body, endsAt: '2030-06-11T16:00:00+09:00' }, // > 12h
        { ...body, maxParticipants: 1 }, { ...body, maxParticipants: 51 }, { ...body, maxParticipants: 2.5 }, { ...body, maxParticipants: '5' },
      ];
      for (const b of bad) assert.equal((await post(1, b)).status, 400, JSON.stringify(b));
      assert.equal((await post(1, { ...body, courseId: 999 })).status, 404);
      assert.equal((await post(1, [])).status, 400);
    });
  });

  describe('discovery', () => {
    it('lists upcoming scheduled sessions, earliest first, excluding cancelled ones', async () => {
      const all = await api.call('GET', '/api/one-time-sessions');
      assert.equal(all.status, 200);
      const found = ids(all);
      assert.ok(found.includes(1) && found.includes(2) && found.includes(3));
      assert.ok(!found.includes(4), 'cancelled sessions are hidden by default');
      assert.deepEqual(found.slice(0, 3), [1, 2, 3]); // ordered by start time
      assert.deepEqual(ids(await api.call('GET', '/api/one-time-sessions?status=cancelled')), [4]);
    });

    it('filters by course, date window, joined and open', async () => {
      assert.deepEqual(ids(await api.call('GET', '/api/one-time-sessions?courseId=8')), [3]);
      assert.deepEqual(ids(await api.call('GET', `/api/one-time-sessions?${WINDOW}`)), [created, created + 1]);
      assert.deepEqual(ids(await api.call('GET', '/api/one-time-sessions?joined=true', { user: 1 })), [2, created]);
      // open = has room and the viewer has not joined: excludes 2 (joined) and 3 (full)
      const open = ids(await api.call('GET', '/api/one-time-sessions?open=true', { user: 1 }));
      assert.ok(open.includes(1));
      assert.ok(!open.includes(2) && !open.includes(3));
      assert.equal((await api.call('GET', '/api/one-time-sessions?joined=true')).status, 401);
    });

    it('validates query parameters', async () => {
      for (const qs of ['courseId=x', 'status=bogus', 'joined=maybe', 'open=1', 'from=garbage', 'limit=0', 'limit=101']) {
        assert.equal((await api.call('GET', `/api/one-time-sessions?${qs}`, { user: 1 })).status, 400, qs);
      }
      assert.equal((await api.call('GET', '/api/one-time-sessions/999')).status, 404);
      assert.equal((await api.call('GET', '/api/one-time-sessions/abc')).status, 400);
    });
  });

  describe('participation', () => {
    it('lets a student join once and records them as a participant', async () => {
      const r = await api.call('POST', '/api/one-time-sessions/1/join', { user: 1 });
      assert.equal(r.status, 201);
      assert.equal(r.json.session.isParticipant, true);
      assert.equal(r.json.session.participantCount, 3);
      assert.deepEqual(r.json.session.participants.map((p: { id: number }) => p.id), [2, 3, 1]); // creator first
      assert.equal((await api.call('POST', '/api/one-time-sessions/1/join', { user: 1 })).status, 409); // duplicate
      const { getDb } = await import('../db');
      assert.throws(() => getDb().prepare('INSERT INTO one_time_session_participants (session_id, user_id) VALUES (1, 1)').run(), /UNIQUE|PRIMARY KEY/i);
      assert.equal((await api.call('GET', '/api/one-time-sessions/1')).json.session.participantCount, 3);
    });

    it('rejects joining full, cancelled, started, unknown or unauthenticated', async () => {
      assert.equal((await api.call('POST', '/api/one-time-sessions/3/join', { user: 1 })).status, 409); // full (2/2)
      assert.equal((await api.call('POST', '/api/one-time-sessions/4/join', { user: 1 })).status, 409); // cancelled
      assert.equal((await api.call('POST', '/api/one-time-sessions/99/join', { user: 1 })).status, 404);
      assert.equal((await api.call('POST', '/api/one-time-sessions/1/join')).status, 401);
      const { getDb } = await import('../db');
      getDb().prepare("UPDATE one_time_sessions SET starts_at = '2024-01-01T00:00:00.000Z', ends_at = '2024-01-01T01:00:00.000Z' WHERE id = 2").run();
      assert.equal((await api.call('POST', '/api/one-time-sessions/2/join', { user: 4 })).status, 409); // already started
    });

    it('never exceeds capacity', async () => {
      const r = await api.call('POST', '/api/one-time-sessions', { user: 3, body: { ...body, title: 'Tiny group', maxParticipants: 2 } });
      const id = r.json.session.id;
      assert.equal((await api.call('POST', `/api/one-time-sessions/${id}/join`, { user: 1 })).status, 201);
      assert.equal((await api.call('POST', `/api/one-time-sessions/${id}/join`, { user: 2 })).status, 409);
      assert.equal((await api.call('GET', `/api/one-time-sessions/${id}`)).json.session.participantCount, 2);
    });

    it('lets participants leave but not the creator', async () => {
      const r = await api.call('DELETE', '/api/one-time-sessions/1/join', { user: 1 });
      assert.equal(r.status, 200);
      assert.equal(r.json.session.isParticipant, false);
      assert.equal(r.json.session.participantCount, 2);
      assert.equal((await api.call('DELETE', '/api/one-time-sessions/1/join', { user: 1 })).status, 409); // not joined
      assert.equal((await api.call('DELETE', '/api/one-time-sessions/1/join', { user: 2 })).status, 403); // creator
      assert.equal((await api.call('DELETE', '/api/one-time-sessions/1/join')).status, 401);
    });

    it('lets only the creator cancel, once, and then blocks joins', async () => {
      const r = await api.call('POST', '/api/one-time-sessions', { user: 2, body: { ...body, courseId: 3, title: 'Will be cancelled' } });
      const id = r.json.session.id;
      assert.equal((await api.call('POST', `/api/one-time-sessions/${id}/cancel`, { user: 1 })).status, 403);
      assert.equal((await api.call('POST', `/api/one-time-sessions/${id}/cancel`)).status, 401);
      const done = await api.call('POST', `/api/one-time-sessions/${id}/cancel`, { user: 2 });
      assert.equal(done.json.session.status, 'cancelled');
      assert.equal((await api.call('POST', `/api/one-time-sessions/${id}/cancel`, { user: 2 })).status, 409);
      assert.equal((await api.call('POST', `/api/one-time-sessions/${id}/join`, { user: 1 })).status, 409);
      const cal = await api.call('GET', `/api/calendar/study-groups?${WINDOW}`, { user: 2 });
      assert.ok(!oneTimeIds(cal).includes(id), 'cancelled sessions leave the calendar');
    });
  });

  describe('calendar visibility', () => {
    it('shows the creator\'s and joined sessions under scope=mine, and nothing else', async () => {
      const alex = await api.call('GET', `/api/calendar/study-groups?${WINDOW}`, { user: 1 });
      assert.equal(alex.status, 200);
      assert.ok(oneTimeIds(alex).includes(created)); // created by Alex
      assert.ok(!oneTimeIds(alex).includes(1)); // Alex left session 1
      const priya = await api.call('GET', '/api/calendar/study-groups?scope=mine', { user: 2 });
      assert.deepEqual(oneTimeIds(priya), [1, 3]); // participant in 1 (creator) and 3 (joined), default window = next 60 days
      assert.equal(priya.json.oneTimeSessions[0].isParticipant, true);
      assert.ok(priya.json.oneTimeSessions[0].startsAtJst.endsWith('+09:00'));
      // recurring study-group sessions are still returned alongside, unchanged
      assert.deepEqual(priya.json.sessions.map((s: { id: number }) => s.id), [1, 5, 2]);
      const marcus = await api.call('GET', '/api/calendar/study-groups', { user: 3 });
      assert.ok(oneTimeIds(marcus).includes(1));
      assert.deepEqual(oneTimeIds(await api.call('GET', '/api/calendar/study-groups', { user: 6 })), []);
    });

    it('includes a session once the student joins it, and drops it when they leave', async () => {
      // Sofia (4) is enrolled in CS330; Alex's CS101 session is not in her courses, so it is not offered but can still be joined.
      const before = await api.call('GET', `/api/calendar/study-groups?${WINDOW}`, { user: 5 });
      assert.ok(!oneTimeIds(before).includes(created));
      await api.call('POST', `/api/one-time-sessions/${created}/join`, { user: 5 });
      const joined = await api.call('GET', `/api/calendar/study-groups?${WINDOW}`, { user: 5 });
      assert.ok(oneTimeIds(joined).includes(created));
      await api.call('DELETE', `/api/one-time-sessions/${created}/join`, { user: 5 });
      assert.ok(!oneTimeIds(await api.call('GET', `/api/calendar/study-groups?${WINDOW}`, { user: 5 })).includes(created));
    });

    it('offers open sessions in the student\'s own courses under scope=discover', async () => {
      // Alex is enrolled in CS101 (session 2 is CS101 but he joined it and it has started) - create one by another user.
      const r = await api.call('POST', '/api/one-time-sessions', { user: 5, body: { ...body, courseId: 2, title: 'OOP help session' } });
      const id = r.json.session.id;
      const alex = await api.call('GET', `/api/calendar/study-groups?scope=discover&${WINDOW}`, { user: 1 });
      assert.ok(oneTimeIds(alex).includes(id)); // CS102 is one of Alex's courses
      assert.equal(alex.json.oneTimeSessions.find((s: { id: number }) => s.id === id).isParticipant, false);
      assert.ok(!oneTimeIds(alex).includes(created)); // his own session is under "mine"
      await api.call('POST', `/api/one-time-sessions/${id}/join`, { user: 1 });
      assert.ok(!oneTimeIds(await api.call('GET', `/api/calendar/study-groups?scope=discover&${WINDOW}`, { user: 1 })).includes(id));
      assert.ok(oneTimeIds(await api.call('GET', `/api/calendar/study-groups?${WINDOW}`, { user: 1 })).includes(id));
      // Full sessions are not offered: fill it (max 4) then check a newcomer enrolled in the course.
      assert.ok(!oneTimeIds(await api.call('GET', '/api/calendar/study-groups?scope=discover', { user: 2 })).includes(3)); // full + joined
    });

    it('respects the requested date window', async () => {
      const inside = await api.call('GET', '/api/calendar/study-groups?from=2030-06-10&to=2030-06-11', { user: 1 });
      assert.ok(oneTimeIds(inside).includes(created));
      for (const w of ['from=2030-06-11&to=2030-06-12', 'from=2030-06-09&to=2030-06-10']) {
        assert.ok(!oneTimeIds(await api.call('GET', `/api/calendar/study-groups?${w}`, { user: 1 })).includes(created), w);
      }
    });

    it('never recurs: a long window contains each session exactly once', async () => {
      const year = await api.call('GET', '/api/calendar/study-groups?from=2030-01-01&to=2030-12-31', { user: 1 });
      assert.equal(oneTimeIds(year).filter((id) => id === created).length, 1);
      const { getDb } = await import('../db');
      const cols = (getDb().prepare('PRAGMA table_info(one_time_sessions)').all() as { name: string }[]).map((c) => c.name);
      assert.ok(!cols.some((c) => /recur|repeat|weekly|rrule/i.test(c)), 'schema has no recurrence column');
      assert.equal((await api.call('GET', '/api/calendar/study-groups?from=2031-01-01&to=2031-12-31', { user: 1 })).json.oneTimeSessions.length, 0);
    });

    it('still requires a demo user', async () => {
      assert.equal((await api.call('GET', '/api/calendar/study-groups')).status, 401);
    });
  });
});
