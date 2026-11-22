import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApi, type TestApi } from '../test/helpers';

// Seed: group 1 (CS201) created by Priya (2), members Priya + Marcus (3).
describe('study groups and group sessions', () => {
  let api: TestApi;
  before(async () => { api = await startTestApi(); });
  after(() => api.close());

  const body = { title: 'Graph traversal review', startsAt: '2030-04-02T18:00:00+09:00', endsAt: '2030-04-02T19:30:00+09:00' };

  it('browses groups with members', async () => {
    const all = await api.call('GET', '/api/study-groups');
    assert.equal(all.json.studyGroups.length, 4);
    assert.deepEqual((await api.call('GET', '/api/study-groups?courseId=3')).json.studyGroups.map((g: { id: number }) => g.id), [1]);
    assert.deepEqual((await api.call('GET', '/api/study-groups/1')).json.studyGroup.memberIds, [2, 3]);
    assert.equal((await api.call('GET', '/api/study-groups/99')).status, 404);
  });

  it('lets only the creator schedule a session, defaulting the location', async () => {
    assert.equal((await api.call('POST', '/api/study-groups/1/sessions', { body })).status, 401);
    assert.equal((await api.call('POST', '/api/study-groups/1/sessions', { user: 3, body })).status, 403); // member, not creator
    assert.equal((await api.call('POST', '/api/study-groups/99/sessions', { user: 2, body })).status, 404);
    const r = await api.call('POST', '/api/study-groups/1/sessions', { user: 2, body });
    assert.equal(r.status, 201);
    assert.equal(r.json.session.location, 'CS Lounge'); // from the group
    assert.equal(r.json.session.startsAt, '2030-04-02T09:00:00.000Z');
    assert.equal(r.json.session.startsAtJst, '2030-04-02T18:00:00.000+09:00');
    assert.equal(r.json.session.isMember, true);
    const list = await api.call('GET', '/api/study-groups/1/sessions', { user: 3 });
    assert.ok(list.json.sessions.some((s: { id: number }) => s.id === r.json.session.id));
  });

  it('validates the session payload', async () => {
    const post = (b: unknown) => api.call('POST', '/api/study-groups/1/sessions', { user: 2, body: b });
    for (const bad of [
      { ...body, title: 'a' }, { ...body, startsAt: '2030-04-02T18:00:00' },
      { ...body, endsAt: '2030-04-02T17:00:00+09:00' }, { ...body, endsAt: '2030-04-03T18:00:00+09:00' },
      { ...body, startsAt: '2020-04-02T18:00:00+09:00', endsAt: '2020-04-02T19:00:00+09:00' }, [],
    ]) assert.equal((await post(bad)).status, 400, JSON.stringify(bad));
  });

  it('lets only the creator cancel, once', async () => {
    const { json } = await api.call('POST', '/api/study-groups/1/sessions', { user: 2, body: { ...body, title: 'Cancel me' } });
    const id = json.session.id;
    assert.equal((await api.call('POST', `/api/study-group-sessions/${id}/cancel`, { user: 3 })).status, 403);
    const r = await api.call('POST', `/api/study-group-sessions/${id}/cancel`, { user: 2 });
    assert.equal(r.json.session.status, 'cancelled');
    assert.equal((await api.call('POST', `/api/study-group-sessions/${id}/cancel`, { user: 2 })).status, 409);
    const cal = await api.call('GET', '/api/calendar/study-groups?from=2030-04-01&to=2030-04-30', { user: 3 });
    assert.ok(!cal.json.sessions.some((s: { id: number }) => s.id === id)); // cancelled sessions leave the calendar
  });
});
