import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApi, type TestApi } from '../test/helpers';

// Seed: tutor 1 = user 3 (Marcus; courses 3,5,7), tutor 2 = user 4 (Sofia; courses 1,8,10); users 1 (Alex), 2 (Priya) are students.
// Test meetings use fixed far-future dates so they never depend on the wall clock.
describe('tutoring requests and sessions', () => {
  let api: TestApi;
  before(async () => { api = await startTestApi(); });
  after(() => api.close());

  const proposal = (day: string, from = '14:00', to = '15:00') => ({
    startsAt: `2030-01-${day}T${from}:00+09:00`, endsAt: `2030-01-${day}T${to}:00+09:00`,
    locationType: 'city_campus', locationDetails: 'Library Room 2B', note: 'See you then',
  });
  async function newRequest(student: number, tutorId: number, courseId: number, topic = 'Topic for tutoring') {
    const r = await api.call('POST', '/api/tutoring-requests', { user: student, body: { courseId, tutorId, topic, details: 'Need help' } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return r.json.request as { id: number };
  }

  describe('creating requests', () => {
    it('creates an open request addressed to the tutor', async () => {
      const r = await api.call('POST', '/api/tutoring-requests', { user: 1, body: { courseId: 3, tutorId: 1, topic: 'Tree traversals', slotId: 1 } });
      assert.equal(r.status, 201);
      assert.equal(r.json.request.status, 'open');
      assert.equal(r.json.request.student.name, 'Alex Rivera');
      assert.equal(r.json.request.tutor.name, 'Marcus Chen');
      assert.equal(r.json.request.slotId, 1);
      assert.equal(r.json.request.proposal, null);
    });

    it('validates input and relationships', async () => {
      const ok = { courseId: 3, tutorId: 1, topic: 'Tree traversals' };
      const post = (user: number | undefined, body: unknown) => api.call('POST', '/api/tutoring-requests', { user, body });
      assert.equal((await post(undefined, ok)).status, 401);
      assert.equal((await post(1, { ...ok, topic: 'ab' })).status, 400);
      assert.equal((await post(1, { ...ok, courseId: 'x' })).status, 400);
      assert.equal((await post(1, { ...ok, courseId: 99 })).status, 404);
      assert.equal((await post(1, { ...ok, tutorId: 99 })).status, 404);
      assert.equal((await post(1, { ...ok, courseId: 1 })).status, 400); // Marcus does not tutor CS101
      assert.equal((await post(3, ok)).status, 400); // cannot request yourself
      assert.equal((await post(1, { ...ok, slotId: 4 })).status, 400); // slot 4 belongs to tutor 2
    });

    it('lists requests per role and enforces visibility', async () => {
      const asTutor = await api.call('GET', '/api/tutoring-requests?role=tutor', { user: 3 });
      assert.ok(asTutor.json.requests.length >= 3);
      assert.ok(asTutor.json.requests.every((r: { tutor: { id: number } }) => r.tutor.id === 3));
      const asStudent = await api.call('GET', '/api/tutoring-requests?role=student', { user: 1 });
      assert.ok(asStudent.json.requests.every((r: { studentId: number }) => r.studentId === 1));
      const open = await api.call('GET', '/api/tutoring-requests?status=rejected', { user: 2 });
      assert.deepEqual(open.json.requests.map((r: { id: number }) => r.id), [5]);
      assert.equal((await api.call('GET', '/api/tutoring-requests?status=nope', { user: 1 })).status, 400);
      assert.equal((await api.call('GET', '/api/tutoring-requests/3', { user: 1 })).status, 200);
      assert.equal((await api.call('GET', '/api/tutoring-requests/3', { user: 4 })).status, 403); // unrelated tutor
    });
  });

  describe('approval, rejection and confirmation', () => {
    it('lets only the requested tutor approve, with validated meeting details', async () => {
      const { id } = await newRequest(1, 1, 5);
      const approve = (user: number, body: unknown) => api.call('POST', `/api/tutoring-requests/${id}/approve`, { user, body });
      assert.equal((await approve(2, proposal('10'))).status, 403); // another student
      assert.equal((await approve(4, proposal('10'))).status, 403); // another tutor
      assert.equal((await approve(1, proposal('10'))).status, 403); // the requester
      assert.equal((await api.call('POST', `/api/tutoring-requests/${id}/approve`, { body: proposal('10') })).status, 401);
      const bad: Record<string, unknown>[] = [
        { ...proposal('10'), startsAt: '2030-01-10T14:00:00' }, // no offset
        { ...proposal('10'), startsAt: 'tomorrow' },
        { ...proposal('10'), endsAt: '2030-01-10T13:00:00+09:00' }, // ends before start
        { ...proposal('10'), startsAt: '2020-01-10T14:00:00+09:00', endsAt: '2020-01-10T15:00:00+09:00' }, // past
        { ...proposal('10'), endsAt: '2030-01-10T23:30:00+09:00' }, // > 8h
        { ...proposal('10'), locationType: 'moon' },
        {},
      ];
      for (const body of bad) assert.equal((await approve(3, body)).status, 400, JSON.stringify(body));
      const ok = await approve(3, proposal('10'));
      assert.equal(ok.status, 200);
      assert.equal(ok.json.request.status, 'accepted');
      assert.equal(ok.json.request.tutorNote, 'See you then');
      // stored as UTC, rendered for JST
      assert.equal(ok.json.request.proposal.startsAt, '2030-01-10T05:00:00.000Z');
      assert.equal(ok.json.request.proposal.startsAtJst, '2030-01-10T14:00:00.000+09:00');
      assert.equal(ok.json.request.proposal.endsAtJst, '2030-01-10T15:00:00.000+09:00');
      assert.equal(ok.json.request.proposal.timeZone, 'Asia/Tokyo');
      assert.equal((await approve(3, proposal('11'))).status, 409); // already approved
    });

    it('rejects a request with a note and blocks further transitions', async () => {
      const { id } = await newRequest(2, 2, 1);
      assert.equal((await api.call('POST', `/api/tutoring-requests/${id}/reject`, { user: 1, body: {} })).status, 403);
      const r = await api.call('POST', `/api/tutoring-requests/${id}/reject`, { user: 4, body: { note: 'Fully booked' } });
      assert.equal(r.json.request.status, 'rejected');
      assert.equal(r.json.request.tutorNote, 'Fully booked');
      assert.equal((await api.call('POST', `/api/tutoring-requests/${id}/reject`, { user: 4 })).status, 409);
      assert.equal((await api.call('POST', `/api/tutoring-requests/${id}/approve`, { user: 4, body: proposal('12') })).status, 409);
      assert.equal((await api.call('POST', `/api/tutoring-requests/${id}/confirm`, { user: 2 })).status, 409);
      assert.equal((await api.call('POST', `/api/tutoring-requests/${id}/cancel`, { user: 2 })).status, 409);
    });

    it('confirms an approved request into a persisted session', async () => {
      const { id } = await newRequest(1, 1, 3, 'Heap deep dive');
      const confirm = (user: number) => api.call('POST', `/api/tutoring-requests/${id}/confirm`, { user });
      assert.equal((await confirm(1)).status, 409); // not approved yet
      await api.call('POST', `/api/tutoring-requests/${id}/approve`, { user: 3, body: proposal('15') });
      assert.equal((await confirm(3)).status, 403); // tutor cannot confirm for the student
      assert.equal((await confirm(2)).status, 403);
      const r = await confirm(1);
      assert.equal(r.status, 201);
      assert.equal(r.json.request.status, 'confirmed');
      assert.equal(r.json.request.sessionId, r.json.session.id);
      const s = r.json.session;
      assert.equal(s.status, 'scheduled');
      assert.equal(s.courseCode, 'CS201');
      assert.equal(s.student.id, 1);
      assert.equal(s.tutor.id, 3);
      assert.equal(s.locationType, 'city_campus');
      assert.equal(s.startsAtJst, '2030-01-15T14:00:00.000+09:00');
      assert.equal((await confirm(1)).status, 409); // cannot confirm twice

      // persisted: both participants can read it, others cannot
      for (const user of [1, 3]) {
        const got = await api.call('GET', `/api/tutoring-sessions/${s.id}`, { user });
        assert.equal(got.status, 200);
        assert.equal(got.json.session.requestId, id);
        assert.ok((await api.call('GET', '/api/tutoring-sessions', { user })).json.sessions.some((x: { id: number }) => x.id === s.id));
      }
      assert.equal((await api.call('GET', `/api/tutoring-sessions/${s.id}`, { user: 2 })).status, 403);
      assert.equal((await api.call('GET', `/api/tutoring-sessions/${s.id}`)).status, 401);
    });

    it('lets the student withdraw an open or approved request', async () => {
      const { id } = await newRequest(2, 1, 7);
      assert.equal((await api.call('POST', `/api/tutoring-requests/${id}/cancel`, { user: 3 })).status, 403);
      assert.equal((await api.call('POST', `/api/tutoring-requests/${id}/cancel`, { user: 2 })).json.request.status, 'cancelled');
      const second = await newRequest(2, 1, 7);
      await api.call('POST', `/api/tutoring-requests/${second.id}/approve`, { user: 3, body: proposal('20') });
      assert.equal((await api.call('POST', `/api/tutoring-requests/${second.id}/cancel`, { user: 2 })).json.request.status, 'cancelled');
    });

    it('prevents double-booking the tutor or the student', async () => {
      // Session from the previous test occupies tutor 1 / student 1 on 2030-01-15 14:00-15:00 JST.
      const other = await newRequest(2, 1, 3, 'Clashing request');
      const clash = await api.call('POST', `/api/tutoring-requests/${other.id}/approve`, { user: 3, body: proposal('15', '14:30', '15:30') });
      assert.equal(clash.status, 409);
      // Student-side clash detected at confirmation time: Alex gets two approvals for the same hour from different tutors.
      const a = await newRequest(1, 1, 5, 'Slot A');
      const b = await newRequest(1, 2, 1, 'Slot B');
      await api.call('POST', `/api/tutoring-requests/${a.id}/approve`, { user: 3, body: proposal('25') });
      await api.call('POST', `/api/tutoring-requests/${b.id}/approve`, { user: 4, body: proposal('25') });
      assert.equal((await api.call('POST', `/api/tutoring-requests/${a.id}/confirm`, { user: 1 })).status, 201);
      assert.equal((await api.call('POST', `/api/tutoring-requests/${b.id}/confirm`, { user: 1 })).status, 409);
    });
  });

  describe('session status transitions', () => {
    async function bookedSession() {
      const { id } = await newRequest(2, 1, 3, 'Session transitions');
      await api.call('POST', `/api/tutoring-requests/${id}/approve`, { user: 3, body: proposal('28', '10:00', '11:00') });
      const r = await api.call('POST', `/api/tutoring-requests/${id}/confirm`, { user: 2 });
      return { requestId: id, session: r.json.session as { id: number } };
    }

    it('cancels by either participant, records who, mirrors onto the request, and is terminal', async () => {
      const { requestId, session } = await bookedSession();
      assert.equal((await api.call('POST', `/api/tutoring-sessions/${session.id}/cancel`, { user: 1 })).status, 403); // outsider
      const r = await api.call('POST', `/api/tutoring-sessions/${session.id}/cancel`, { user: 2 });
      assert.equal(r.json.session.status, 'cancelled');
      assert.equal(r.json.session.cancelledById, 2);
      assert.equal((await api.call('GET', `/api/tutoring-requests/${requestId}`, { user: 2 })).json.request.status, 'cancelled');
      assert.equal((await api.call('POST', `/api/tutoring-sessions/${session.id}/cancel`, { user: 3 })).status, 409);
      assert.equal((await api.call('POST', `/api/tutoring-sessions/${session.id}/complete`, { user: 3 })).status, 409);
      // the freed time slot can be booked again
      const again = await newRequest(1, 1, 3, 'Rebook');
      assert.equal((await api.call('POST', `/api/tutoring-requests/${again.id}/approve`, { user: 3, body: proposal('28', '10:00', '11:00') })).status, 200);
    });

    it('lets only the tutor complete a session, and only once it has started', async () => {
      const { session } = await bookedSession();
      assert.equal((await api.call('POST', `/api/tutoring-sessions/${session.id}/complete`, { user: 3 })).status, 409); // future
      assert.equal((await api.call('POST', `/api/tutoring-sessions/${session.id}/complete`, { user: 2 })).status, 403); // student

      // Move the session into the past directly in SQLite, then complete it through the API.
      const { getDb } = await import('../db');
      getDb().prepare("UPDATE tutoring_sessions SET starts_at = '2024-01-01T01:00:00.000Z', ends_at = '2024-01-01T02:00:00.000Z' WHERE id = ?").run(session.id);
      const done = await api.call('POST', `/api/tutoring-sessions/${session.id}/complete`, { user: 3 });
      assert.equal(done.status, 200);
      assert.equal(done.json.session.status, 'completed');
      assert.equal((await api.call('POST', `/api/tutoring-sessions/${session.id}/cancel`, { user: 2 })).status, 409);
      const detail = await api.call('GET', `/api/tutoring-sessions/${session.id}`, { user: 2 });
      assert.equal(detail.json.session.status, 'completed');
      const requestStatus = await api.call('GET', `/api/tutoring-requests/${detail.json.session.requestId}`, { user: 2 });
      assert.equal(requestStatus.json.request.status, 'completed');
    });

    it('filters the session list by status and validates input', async () => {
      const done = await api.call('GET', '/api/tutoring-sessions?status=completed', { user: 2 });
      assert.ok(done.json.sessions.length >= 1);
      assert.ok(done.json.sessions.every((s: { status: string }) => s.status === 'completed'));
      assert.equal((await api.call('GET', '/api/tutoring-sessions?status=bogus', { user: 2 })).status, 400);
      assert.equal((await api.call('GET', '/api/tutoring-sessions/xyz', { user: 2 })).status, 400);
      assert.equal((await api.call('GET', '/api/tutoring-sessions/9999', { user: 2 })).status, 404);
    });
  });
});
