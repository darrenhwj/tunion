import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApi, type TestApi } from '../test/helpers';

// Seed resources: 1 link (CS201, Priya, 2 votes), 2 PDF (CS201, Marcus, 3 votes), 3 PNG (CS101, Jordan, 1 vote),
// 4 link (CS330, Sofia), 5 link (CS301, Marcus), 6 txt (CS320, Marcus). Users: 1 Alex, 2 Priya, 3 Marcus, 4 Sofia, 5 Jordan.
describe('resources: listing and upvotes', () => {
  let api: TestApi;
  before(async () => { api = await startTestApi(); });
  after(() => api.close());

  it('lists resources with vote counts and the viewer\'s vote', async () => {
    const anon = await api.call('GET', '/api/resources');
    assert.equal(anon.status, 200);
    assert.equal(anon.json.resources.length, 6);
    assert.ok(anon.json.resources.every((r: { hasUpvoted: boolean }) => r.hasUpvoted === false));
    const alex = await api.call('GET', '/api/resources', { user: 1 });
    const byId = (id: number) => alex.json.resources.find((r: { id: number }) => r.id === id);
    assert.equal(byId(2).upvoteCount, 3);
    assert.equal(byId(2).hasUpvoted, true);
    assert.equal(byId(3).hasUpvoted, false);
    assert.equal(byId(1).file, null);
    assert.equal(byId(1).downloadUrl, null);
    assert.equal(byId(2).file.mimeType, 'application/pdf');
    assert.equal(byId(2).previewUrl, '/api/resources/2/preview');
    assert.equal(byId(2).author.name, 'Marcus Chen');
  });

  it('filters, searches, sorts and validates', async () => {
    const ids = async (qs: string) => (await api.call('GET', `/api/resources?${qs}`)).json.resources.map((r: { id: number }) => r.id);
    assert.deepEqual((await ids('courseId=3')).sort(), [1, 2]);
    assert.deepEqual(await ids('q=cheat'), [2]);
    assert.deepEqual(await ids('type=practice'), [4]);
    assert.equal((await ids('sort=top'))[0], 2);
    assert.equal((await ids('limit=2')).length, 2);
    for (const qs of ['courseId=x', 'type=bogus', 'sort=weird', 'limit=0']) assert.equal((await api.call('GET', `/api/resources?${qs}`)).status, 400, qs);
    assert.equal((await api.call('GET', '/api/resources/3')).json.resource.title, 'Loop trace diagram');
    assert.equal((await api.call('GET', '/api/resources/99')).status, 404);
  });

  it('adds one upvote, rejects a duplicate, and allows removal', async () => {
    const add = await api.call('POST', '/api/resources/3/upvote', { user: 1 });
    assert.equal(add.status, 201);
    assert.deepEqual(add.json, { upvoteCount: 2, hasUpvoted: true });
    assert.equal((await api.call('POST', '/api/resources/3/upvote', { user: 1 })).status, 409);
    assert.equal((await api.call('GET', '/api/resources/3', { user: 1 })).json.resource.upvoteCount, 2);
    const removed = await api.call('DELETE', '/api/resources/3/upvote', { user: 1 });
    assert.deepEqual(removed.json, { upvoteCount: 1, hasUpvoted: false });
    assert.equal((await api.call('DELETE', '/api/resources/3/upvote', { user: 1 })).json.upvoteCount, 1); // idempotent
    assert.equal((await api.call('POST', '/api/resources/3/upvote', { user: 1 })).status, 201); // can vote again
  });

  it('enforces one vote per user in the database itself', async () => {
    const { getDb } = await import('../db');
    assert.throws(() => getDb().prepare('INSERT INTO resource_votes (resource_id, user_id) VALUES (2, 1)').run(), /UNIQUE|PRIMARY KEY/i);
    assert.throws(() => getDb().prepare('INSERT INTO resource_votes (resource_id, user_id) VALUES (999, 1)').run(), /FOREIGN KEY/i);
  });

  it('blocks self-votes and unauthenticated or unknown targets', async () => {
    assert.equal((await api.call('POST', '/api/resources/3/upvote', { user: 5 })).status, 403); // own resource
    assert.equal((await api.call('POST', '/api/resources/3/upvote')).status, 401);
    assert.equal((await api.call('POST', '/api/resources/99/upvote', { user: 1 })).status, 404);
    assert.equal((await api.call('POST', '/api/resources/abc/upvote', { user: 1 })).status, 400);
  });

  it('re-ranks by votes', async () => {
    await api.call('POST', '/api/resources/6/upvote', { user: 1 });
    await api.call('POST', '/api/resources/6/upvote', { user: 4 });
    await api.call('POST', '/api/resources/6/upvote', { user: 5 });
    await api.call('POST', '/api/resources/6/upvote', { user: 2 }).catch(() => undefined); // already voted in seed -> 409
    const top = (await api.call('GET', '/api/resources?sort=top&limit=2')).json.resources;
    assert.deepEqual(top.map((r: { id: number }) => r.id), [6, 2]); // 6 now has 4 votes vs 3
  });
});
