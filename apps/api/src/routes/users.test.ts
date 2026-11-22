import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BIO_LENGTH } from '@tunion/shared';
import { startTestApi, type TestApi } from '../test/helpers';

describe('profile bio updates', () => {
  let api: TestApi;
  before(async () => { api = await startTestApi(); });
  after(() => api.close());

  it('requires the profile owner, including when the viewer is an admin', async () => {
    const path = '/api/users/1/bio';
    const body = { bio: 'Unauthorized edit' };
    const before = await api.call('GET', '/api/users/1');

    assert.equal((await api.call('PATCH', path, { body })).status, 401);
    assert.equal((await api.call('PATCH', path, { user: 2, body })).status, 403);
    assert.equal((await api.call('PATCH', path, { user: 6, body })).status, 403);
    assert.deepEqual(await api.call('GET', '/api/users/1'), before);
  });

  it('validates length and type and lets the owner clear the bio', async () => {
    const path = '/api/users/1/bio';
    for (const bio of [false, undefined, 'x'.repeat(MAX_BIO_LENGTH + 1)]) {
      assert.equal((await api.call('PATCH', path, { user: 1, body: { bio } })).status, 400);
    }
    const result = await api.call('PATCH', path, { user: 1, body: { bio: '  ' } });
    assert.equal(result.status, 200);
    assert.equal(result.json.user.bio, '');
  });

  it('persists only the bio and returns it in profile reads after reopening SQLite', async () => {
    const path = '/api/users/2';
    const before = (await api.call('GET', path)).json.user;
    const bio = 'x'.repeat(MAX_BIO_LENGTH);
    const result = await api.call('PATCH', path + '/bio', { user: 2, body: { bio, role: 'admin' } });
    const expected = { ...before, bio };
    assert.equal(result.status, 200);
    assert.deepEqual(result.json.user, expected);

    const { closeDb } = await import('../db');
    closeDb();
    assert.deepEqual((await api.call('GET', path)).json.user, expected);
    assert.deepEqual((await api.call('GET', '/api/me', { user: 2 })).json.user, expected);
  });
});
