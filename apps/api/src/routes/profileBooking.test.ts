import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApi, type TestApi } from '../test/helpers';

// Seed: tutor 1 = user 3 (courses 3,5,7, has slots), tutor 2 = user 4 (courses 1,8,10, has slots). Users 1, 2 are students,
// user 5 is a TA with no tutor profile, user 6 is the admin.
describe('booking a tutor from their profile', () => {
  let api: TestApi;
  before(async () => { api = await startTestApi(); });
  after(() => api.close());

  const book = (user: number | undefined, body: Record<string, unknown>) =>
    api.call('POST', '/api/tutoring-requests', { user, body: { topic: 'Help with recursion', ...body } });

  it('lets a student request a session from another student with a tutor badge', async () => {
    const r = await book(2, { courseId: 7, tutorId: 1, slotId: 1 });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.request.status, 'open');
    assert.equal(r.json.request.studentId, 2);
    assert.equal(r.json.request.tutor.id, 3);
  });

  it('lets a tutor book another tutor', async () => {
    const r = await book(4, { courseId: 5, tutorId: 1 }); // Sofia (tutor 2) asks Marcus (tutor 1)
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.request.studentId, 4);
    assert.equal(r.json.request.tutor.id, 3);
  });

  it('rejects self-booking on the server, for every kind of caller', async () => {
    const own = await book(3, { courseId: 3, tutorId: 1 });
    assert.equal(own.status, 400);
    assert.match(own.json.error, /yourself/);
    assert.equal((await book(4, { courseId: 1, tutorId: 2 })).status, 400);
    const before = (await api.call('GET', '/api/tutoring-requests?role=student', { user: 3 })).json.requests.length;
    await book(3, { courseId: 3, tutorId: 1 });
    assert.equal((await api.call('GET', '/api/tutoring-requests?role=student', { user: 3 })).json.requests.length, before);
  });

  it('rejects nonexistent and inactive tutors', async () => {
    assert.equal((await book(1, { courseId: 3, tutorId: 999 })).status, 404);
    assert.equal((await api.call('PUT', '/api/admin/users/4/tutor-badge', { user: 6, body: { isTutor: false } })).status, 200);
    const inactive = await book(1, { courseId: 1, tutorId: 2 });
    assert.equal(inactive.status, 400);
    assert.match(inactive.json.error, /no longer available/);
    await api.call('PUT', '/api/admin/users/4/tutor-badge', { user: 6, body: { isTutor: true } });
    assert.equal((await book(1, { courseId: 1, tutorId: 2 })).status, 201); // badge restored with its subjects
  });

  it('rejects duplicate pending requests for the same tutor and course', async () => {
    const again = await book(2, { courseId: 7, tutorId: 1 });
    assert.equal(again.status, 409);
    assert.match(again.json.error, /already have a pending request/);
    assert.equal((await book(1, { courseId: 7, tutorId: 1 })).status, 201); // another student asking the same tutor is fine
  });

  it('lets a tutor configure subjects, validates them, and never infers them from courses', async () => {
    const put = (user: number | undefined, body: unknown) => api.call('PUT', '/api/tutors/me/subjects', { user, body });
    assert.equal((await put(undefined, { courseIds: [1] })).status, 401);
    assert.equal((await put(1, { courseIds: [1] })).status, 403); // a student without a badge
    assert.equal((await put(3, { courseIds: 'nope' })).status, 400);
    assert.equal((await put(3, { courseIds: [0] })).status, 400);
    assert.equal((await put(3, { courseIds: [999] })).status, 404);
    const ok = await put(3, { courseIds: [3, 3, 2] });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.json.tutor.courseIds, [2, 3]);
    assert.deepEqual((await api.call('GET', '/api/tutors/me', { user: 3 })).json.tutor.courseIds, [2, 3]);
    assert.equal((await api.call('GET', '/api/tutors/me', { user: 1 })).status, 403);
    assert.equal((await put(3, { courseIds: [3, 5, 7] })).status, 200); // restore
  });

  it('blocks bookings with a tutor who has no subjects or no availability, with a clear reason', async () => {
    // Jordan (TA, user 5) receives a badge: a brand-new tutor profile starts empty and is NOT filled from enrollments.
    const grant = await api.call('PUT', '/api/admin/users/5/tutor-badge', { user: 6, body: { isTutor: true } });
    assert.equal(grant.status, 200);
    const tutor = (await api.call('GET', '/api/tutors/me', { user: 5 })).json.tutor;
    assert.deepEqual(tutor.courseIds, []);
    assert.deepEqual(tutor.slots, []);

    const noSubjects = await book(1, { courseId: 3, tutorId: tutor.id });
    assert.equal(noSubjects.status, 400);
    assert.match(noSubjects.json.error, /not chosen any tutoring subjects/);

    await api.call('PUT', '/api/tutors/me/subjects', { user: 5, body: { courseIds: [3] } });
    const noSlots = await book(1, { courseId: 3, tutorId: tutor.id });
    assert.equal(noSlots.status, 400);
    assert.match(noSlots.json.error, /not set any weekly availability/);
    assert.equal((await book(1, { courseId: 5, tutorId: tutor.id })).status, 400); // course not offered

    const slot = await api.call('POST', '/api/tutors/me/availability', { user: 5, body: { dayOfWeek: 2, startTime: '10:00', endTime: '11:00', locationType: 'online' } });
    assert.equal(slot.status, 201);
    assert.equal((await book(1, { courseId: 3, tutorId: tutor.id, slotId: slot.json.slot.id })).status, 201);
  });

  it('keeps the existing approve / confirm workflow working for a profile-initiated request', async () => {
    const r = await book(1, { courseId: 8, tutorId: 2 });
    assert.equal(r.status, 201);
    const id = r.json.request.id;
    const approve = await api.call('POST', `/api/tutoring-requests/${id}/approve`, {
      user: 4, body: { startsAt: '2031-02-04T10:00:00+09:00', endsAt: '2031-02-04T11:00:00+09:00', locationType: 'online' },
    });
    assert.equal(approve.status, 200);
    assert.equal((await api.call('POST', `/api/tutoring-requests/${id}/confirm`, { user: 1 })).status, 201);
  });
});
