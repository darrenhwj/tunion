import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApi, type TestApi } from '../test/helpers';

// Seed users: 1 Alex (student), 2 Priya (student), 3 Marcus (tutor), 5 Jordan (ta)
describe('discussions API', () => {
  let api: TestApi;
  before(async () => { api = await startTestApi(); });
  after(() => api.close());

  it('lists discussions with aggregates and filters by course', async () => {
    const all = await api.call('GET', '/api/discussions');
    assert.equal(all.status, 200);
    assert.equal(all.json.discussions.length, 6);
    const cs201 = await api.call('GET', '/api/discussions?courseId=3');
    assert.deepEqual(cs201.json.discussions.map((d: { id: number }) => d.id), [2, 1]);
    const d1 = cs201.json.discussions.find((d: { id: number }) => d.id === 1);
    assert.equal(d1.upvoteCount, 3);
    assert.equal(d1.replyCount, 4);
    assert.equal(d1.author.name, 'Alex Rivera');
    assert.equal(d1.hasUpvoted, false);
  });

  it('searches, filters resolved, sorts by top, and paginates', async () => {
    const q = await api.call('GET', '/api/discussions?q=index');
    assert.deepEqual(q.json.discussions.map((d: { id: number }) => d.id), [6]);
    const resolved = await api.call('GET', '/api/discussions?resolved=true');
    assert.deepEqual(resolved.json.discussions.map((d: { id: number }) => d.id).sort(), [1, 4]);
    const top = await api.call('GET', '/api/discussions?sort=top&limit=1');
    assert.equal(top.json.discussions[0].id, 1);
    const page = await api.call('GET', '/api/discussions?limit=2&offset=2');
    assert.equal(page.json.discussions.length, 2);
  });

  it('rejects bad query params', async () => {
    for (const qs of ['courseId=x', 'resolved=maybe', 'sort=weird', 'limit=0', 'limit=101', 'offset=-1']) {
      assert.equal((await api.call('GET', `/api/discussions?${qs}`)).status, 400, qs);
    }
  });

  it('reports hasUpvoted for the demo user', async () => {
    const r = await api.call('GET', '/api/discussions/1', { user: 2 });
    assert.equal(r.json.discussion.hasUpvoted, true);
  });

  it('returns a nested reply tree', async () => {
    const r = await api.call('GET', '/api/discussions/1');
    assert.equal(r.status, 200);
    assert.equal(r.json.replies.length, 2); // reply 1 and reply 4 are top-level
    const first = r.json.replies[0];
    assert.equal(first.id, 1);
    assert.equal(first.replies[0].id, 2);
    assert.equal(first.replies[0].replies[0].id, 3);
    assert.equal(r.json.replies[1].isAcceptedAnswer, true);
  });

  it('404s on unknown discussion and 400s on malformed id', async () => {
    assert.equal((await api.call('GET', '/api/discussions/999')).status, 404);
    assert.equal((await api.call('GET', '/api/discussions/1x')).status, 400);
  });

  describe('creating discussions', () => {
    const valid = { courseId: 3, title: 'Question about heaps', body: 'How does heapify run in O(n)?' };

    it('requires a demo user', async () => {
      assert.equal((await api.call('POST', '/api/discussions', { body: valid })).status, 401);
      assert.equal((await api.call('POST', '/api/discussions', { user: 999, body: valid })).status, 401);
    });

    it('creates and returns the discussion', async () => {
      const r = await api.call('POST', '/api/discussions', { user: 1, body: valid });
      assert.equal(r.status, 201);
      assert.equal(r.json.discussion.authorId, 1);
      assert.equal(r.json.discussion.isResolved, false);
      const fetched = await api.call('GET', `/api/discussions/${r.json.discussion.id}`);
      assert.equal(fetched.json.discussion.title, valid.title);
    });

    it('validates input', async () => {
      const bad: unknown[] = [
        { ...valid, title: 'ab' },
        { ...valid, title: 'x'.repeat(201) },
        { ...valid, body: '   ' },
        { ...valid, body: 42 },
        { ...valid, courseId: 'three' },
        { title: valid.title, body: valid.body },
        [],
      ];
      for (const body of bad) assert.equal((await api.call('POST', '/api/discussions', { user: 1, body })).status, 400, JSON.stringify(body));
      assert.equal((await api.call('POST', '/api/discussions', { user: 1, body: { ...valid, courseId: 999 } })).status, 404);
      assert.equal((await api.call('POST', '/api/discussions', { user: 1, body: '{not json' })).status, 400);
    });
  });

  describe('replies', () => {
    it('adds top-level and nested replies', async () => {
      const top = await api.call('POST', '/api/discussions/5/replies', { user: 2, body: { body: 'Great question!' } });
      assert.equal(top.status, 201);
      assert.equal(top.json.reply.parentReplyId, null);
      const nested = await api.call('POST', '/api/discussions/5/replies', {
        user: 3, body: { body: 'Thanks', parentReplyId: top.json.reply.id },
      });
      assert.equal(nested.status, 201);
      assert.equal(nested.json.reply.parentReplyId, top.json.reply.id);
      const tree = await api.call('GET', '/api/discussions/5');
      const node = tree.json.replies.find((r: { id: number }) => r.id === top.json.reply.id);
      assert.equal(node.replies[0].id, nested.json.reply.id);
    });

    it('validates replies', async () => {
      assert.equal((await api.call('POST', '/api/discussions/5/replies', { body: { body: 'x' } })).status, 401);
      assert.equal((await api.call('POST', '/api/discussions/5/replies', { user: 1, body: { body: '' } })).status, 400);
      assert.equal((await api.call('POST', '/api/discussions/999/replies', { user: 1, body: { body: 'x' } })).status, 404);
      assert.equal((await api.call('POST', '/api/discussions/5/replies', { user: 1, body: { body: 'x', parentReplyId: 999 } })).status, 404);
      // reply 1 belongs to discussion 1, not 5
      assert.equal((await api.call('POST', '/api/discussions/5/replies', { user: 1, body: { body: 'x', parentReplyId: 1 } })).status, 400);
    });
  });

  describe('upvotes', () => {
    it('upvotes once, rejects duplicates, and allows removal', async () => {
      const first = await api.call('POST', '/api/discussions/3/upvote', { user: 1 });
      assert.equal(first.status, 201);
      assert.deepEqual(first.json, { upvoteCount: 2, hasUpvoted: true });
      const dup = await api.call('POST', '/api/discussions/3/upvote', { user: 1 });
      assert.equal(dup.status, 409);
      assert.equal((await api.call('GET', '/api/discussions/3')).json.discussion.upvoteCount, 2);
      const removed = await api.call('DELETE', '/api/discussions/3/upvote', { user: 1 });
      assert.deepEqual(removed.json, { upvoteCount: 1, hasUpvoted: false });
      assert.equal((await api.call('POST', '/api/discussions/3/upvote', { user: 1 })).status, 201);
    });

    it('prevents duplicate reply votes and self-votes', async () => {
      assert.equal((await api.call('POST', '/api/replies/7/upvote', { user: 1 })).status, 201);
      assert.equal((await api.call('POST', '/api/replies/7/upvote', { user: 1 })).status, 409);
      assert.equal((await api.call('POST', '/api/replies/7/upvote', { user: 5 })).status, 403); // own reply
      assert.equal((await api.call('POST', '/api/discussions/3/upvote', { user: 3 })).status, 403); // own discussion
    });

    it('handles auth and unknown targets', async () => {
      assert.equal((await api.call('POST', '/api/discussions/3/upvote')).status, 401);
      assert.equal((await api.call('POST', '/api/discussions/999/upvote', { user: 1 })).status, 404);
      assert.equal((await api.call('POST', '/api/replies/999/upvote', { user: 1 })).status, 404);
      assert.equal((await api.call('POST', '/api/replies/zero/upvote', { user: 1 })).status, 400);
    });
  });

  describe('helpful-answer marking', () => {
    it('lets the discussion author accept a reply and switch to another', async () => {
      const r = await api.call('POST', '/api/replies/5/accept', { user: 2 }); // Priya owns discussion 2
      assert.equal(r.status, 200);
      assert.equal(r.json.reply.isAcceptedAnswer, true);
      assert.equal(r.json.discussion.isResolved, true);
      const other = await api.call('POST', '/api/replies/6/accept', { user: 2 });
      assert.equal(other.json.reply.isAcceptedAnswer, true);
      const tree = (await api.call('GET', '/api/discussions/2')).json.replies;
      const accepted = JSON.stringify(tree).match(/"isAcceptedAnswer":true/g) ?? [];
      assert.equal(accepted.length, 1);
    });

    it('lets staff mark and unmark, and unresolves the discussion', async () => {
      assert.equal((await api.call('POST', '/api/replies/7/accept', { user: 5 })).status, 200); // TA
      const un = await api.call('DELETE', '/api/replies/7/accept', { user: 5 });
      assert.equal(un.json.reply.isAcceptedAnswer, false);
      assert.equal(un.json.discussion.isResolved, false);
    });

    it('forbids other students, anonymous users, and unknown replies', async () => {
      assert.equal((await api.call('POST', '/api/replies/9/accept', { user: 2 })).status, 403);
      assert.equal((await api.call('POST', '/api/replies/9/accept')).status, 401);
      assert.equal((await api.call('POST', '/api/replies/999/accept', { user: 1 })).status, 404);
    });
  });
});
