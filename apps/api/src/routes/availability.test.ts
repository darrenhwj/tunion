import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApi, type TestApi } from '../test/helpers';

// Seed: tutor 1 = user 3 (Marcus, slots 1-3), tutor 2 = user 4 (Sofia, slots 4-6), users 1/2 are students.
describe('tutor availability', () => {
  let api: TestApi;
  before(async () => { api = await startTestApi(); });
  after(() => api.close());

  const slot = { dayOfWeek: 4, startTime: '10:00', endTime: '12:00', locationType: 'hillside_campus' };

  it('lists tutors with slots, filterable by course', async () => {
    const all = await api.call('GET', '/api/tutors');
    assert.equal(all.json.tutors.length, 2);
    assert.equal(all.json.tutors[0].user.name, 'Marcus Chen');
    assert.equal(all.json.tutors[0].slots.length, 3);
    assert.equal(all.json.tutors[0].slots[0].timeZone, 'Asia/Tokyo');
    const cs330 = await api.call('GET', '/api/tutors?courseId=8');
    assert.deepEqual(cs330.json.tutors.map((t: { id: number }) => t.id), [2]);
    assert.equal((await api.call('GET', '/api/tutors/1')).json.tutor.courseIds.length, 3);
    assert.equal((await api.call('GET', '/api/tutors/99')).status, 404);
  });

  it('shows a tutor only their own slots', async () => {
    const r = await api.call('GET', '/api/tutors/me/availability', { user: 3 });
    assert.deepEqual(r.json.slots.map((s: { id: number }) => s.id), [1, 2, 3]);
    assert.equal((await api.call('GET', '/api/tutors/me/availability', { user: 1 })).status, 403); // student, no tutor profile
    assert.equal((await api.call('GET', '/api/tutors/me/availability')).status, 401);
  });

  it('creates a slot and persists it', async () => {
    const r = await api.call('POST', '/api/tutors/me/availability', { user: 3, body: slot });
    assert.equal(r.status, 201);
    assert.equal(r.json.slot.tutorId, 1);
    assert.equal(r.json.slot.locationType, 'hillside_campus');
    const profile = await api.call('GET', '/api/tutors/1');
    assert.ok(profile.json.tutor.slots.some((s: { id: number }) => s.id === r.json.slot.id));
  });

  it('rejects invalid slots', async () => {
    const bad: Record<string, unknown>[] = [
      { ...slot, dayOfWeek: 7 }, { ...slot, dayOfWeek: '1' }, { ...slot, startTime: '9:00' },
      { ...slot, endTime: '25:00' }, { ...slot, startTime: '12:00', endTime: '10:00' },
      { ...slot, startTime: '10:00', endTime: '10:00' }, { ...slot, locationType: 'moon' }, {},
    ];
    for (const body of bad) assert.equal((await api.call('POST', '/api/tutors/me/availability', { user: 3, body })).status, 400, JSON.stringify(body));
    assert.equal((await api.call('POST', '/api/tutors/me/availability', { user: 1, body: slot })).status, 403);
  });

  it('rejects overlapping slots on the same day but allows adjacent ones', async () => {
    const overlap = await api.call('POST', '/api/tutors/me/availability', { user: 3, body: { ...slot, startTime: '11:00', endTime: '13:00' } });
    assert.equal(overlap.status, 409);
    const adjacent = await api.call('POST', '/api/tutors/me/availability', { user: 3, body: { ...slot, startTime: '12:00', endTime: '13:00', locationType: 'online' } });
    assert.equal(adjacent.status, 201);
  });

  it('edits own slots (partial update, re-validated)', async () => {
    const r = await api.call('PATCH', '/api/tutors/me/availability/1', { user: 3, body: { locationType: 'online', endTime: '18:30' } });
    assert.equal(r.status, 200);
    assert.equal(r.json.slot.locationType, 'online');
    assert.equal(r.json.slot.endTime, '18:30');
    assert.equal(r.json.slot.startTime, '16:00'); // untouched
    assert.equal((await api.call('PATCH', '/api/tutors/me/availability/1', { user: 3, body: { startTime: '19:00' } })).status, 400); // start after end
    assert.equal((await api.call('PATCH', '/api/tutors/me/availability/1', { user: 3, body: {} })).status, 400);
    // move slot 3 (Sat 10-12) onto Wednesday 16:30 -> overlaps slot 2 (Wed 16-18)
    assert.equal((await api.call('PATCH', '/api/tutors/me/availability/3', { user: 3, body: { dayOfWeek: 3, startTime: '16:30', endTime: '17:30' } })).status, 409);
  });

  it("protects other tutors' slots", async () => {
    assert.equal((await api.call('PATCH', '/api/tutors/me/availability/4', { user: 3, body: { locationType: 'online' } })).status, 403);
    assert.equal((await api.call('DELETE', '/api/tutors/me/availability/4', { user: 3 })).status, 403);
    assert.equal((await api.call('PATCH', '/api/tutors/me/availability/1', { body: { locationType: 'online' } })).status, 401);
    assert.equal((await api.call('PATCH', '/api/tutors/me/availability/1', { user: 4, body: { locationType: 'online' } })).status, 403);
    const still = await api.call('GET', '/api/tutors/2');
    assert.equal(still.json.tutor.slots.find((s: { id: number }) => s.id === 4).locationType, 'hillside_campus');
  });

  it('deletes own slots', async () => {
    const r = await api.call('DELETE', '/api/tutors/me/availability/2', { user: 3 });
    assert.deepEqual(r.json, { deleted: true, id: 2 });
    assert.equal((await api.call('DELETE', '/api/tutors/me/availability/2', { user: 3 })).status, 404);
    const mine = await api.call('GET', '/api/tutors/me/availability', { user: 3 });
    assert.ok(!mine.json.slots.some((s: { id: number }) => s.id === 2));
    assert.equal((await api.call('DELETE', '/api/tutors/me/availability/abc', { user: 3 })).status, 400);
  });
});
