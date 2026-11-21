import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApi, type TestApi } from '../test/helpers';

describe('courses API', () => {
  let api: TestApi;
  before(async () => { api = await startTestApi(); });
  after(() => api.close());

  it('lists all courses ordered by code', async () => {
    const r = await api.call('GET', '/api/courses');
    assert.equal(r.status, 200);
    assert.equal(r.json.courses.length, 10);
    assert.equal(r.json.courses[0].code, 'CS101');
  });

  it('searches by text (title, code, description), case-insensitively', async () => {
    const byTitle = await api.call('GET', '/api/courses?q=algorithms');
    assert.deepEqual(byTitle.json.courses.map((c: { code: string }) => c.code), ['CS301']);
    const byCode = await api.call('GET', '/api/courses?q=cs33');
    assert.deepEqual(byCode.json.courses.map((c: { code: string }) => c.code), ['CS330']);
  });

  it('treats LIKE wildcards literally', async () => {
    const r = await api.call('GET', '/api/courses?q=%25');
    assert.equal(r.json.courses.length, 0);
  });

  it('filters by level and combines with search', async () => {
    const r = await api.call('GET', '/api/courses?level=200');
    assert.deepEqual(r.json.courses.map((c: { code: string }) => c.code), ['CS201', 'CS202']);
    const both = await api.call('GET', '/api/courses?level=300&q=database');
    assert.deepEqual(both.json.courses.map((c: { code: string }) => c.code), ['CS330']);
  });

  it('rejects an invalid level', async () => {
    assert.equal((await api.call('GET', '/api/courses?level=999')).status, 400);
  });

  it('returns course details, 404 for unknown, 400 for malformed id', async () => {
    const ok = await api.call('GET', '/api/courses/3');
    assert.equal(ok.json.course.code, 'CS201');
    assert.equal((await api.call('GET', '/api/courses/999')).status, 404);
    assert.equal((await api.call('GET', '/api/courses/abc')).status, 400);
  });
});
