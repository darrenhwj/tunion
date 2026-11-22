import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { startTestApi, type TestApi } from '../test/helpers';

// (One startTestApi() per file: the DB path is fixed at first import, so uploads get their own file.)
// Seed resources: 1 link (CS201, Priya, 2 votes), 2 PDF (CS201, Marcus, 3 votes), 3 PNG (CS101, Jordan, 1 vote),
// 4 link (CS330, Sofia), 5 link (CS301, Marcus), 6 txt (CS320, Marcus). Users: 1 Alex, 2 Priya, 3 Marcus, 4 Sofia, 5 Jordan.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

function form(fields: Record<string, string>, file?: { name: string; data: Buffer; type?: string }) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  if (file) f.set('file', new Blob([new Uint8Array(file.data)], { type: file.type ?? 'application/octet-stream' }), file.name);
  return f;
}
const meta = { courseId: '3', title: 'Uploaded notes', description: 'Lecture notes', type: 'notes' };

describe('resource uploads, preview and download', () => {
  let api: TestApi;
  let uploadsDir: string;
  before(async () => {
    api = await startTestApi();
    uploadsDir = (await import('../uploads')).UPLOAD_DIR;
  });
  after(() => api.close());

  const upload = (user: number | undefined, fields: Record<string, string>, file?: { name: string; data: Buffer; type?: string }) =>
    api.call('POST', '/api/resources', { user, form: form(fields, file) });

  it('creates a link resource from JSON and rejects unsafe or missing links', async () => {
    const ok = await api.call('POST', '/api/resources', { user: 1, body: { ...meta, type: 'link', url: 'https://example.edu/notes' } });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.resource.url, 'https://example.edu/notes');
    assert.equal(ok.json.resource.file, null);
    assert.equal(ok.json.resource.authorId, 1);
    for (const url of ['javascript:alert(1)', 'ftp://x.edu/a', 'not a url', 'file:///etc/passwd']) {
      assert.equal((await api.call('POST', '/api/resources', { user: 1, body: { ...meta, url } })).status, 400, url);
    }
    assert.equal((await api.call('POST', '/api/resources', { user: 1, body: meta })).status, 400); // neither
    assert.equal((await api.call('POST', '/api/resources', { body: { ...meta, url: 'https://a.edu' } })).status, 401);
  });

  it('uploads an image, stores metadata, and serves identical bytes for download and preview', async () => {
    const r = await upload(1, meta, { name: 'diagram.png', data: PNG, type: 'image/png' });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const res = r.json.resource;
    assert.equal(res.url, null);
    assert.deepEqual(res.file, { filename: 'diagram.png', mimeType: 'image/png', sizeBytes: PNG.length, previewable: true });
    assert.equal(res.previewUrl, `/api/resources/${res.id}/preview`);

    const preview = await api.raw('GET', res.previewUrl, { user: 2 });
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get('content-type'), 'image/png');
    assert.match(preview.headers.get('content-disposition') ?? '', /^inline;/);
    assert.equal(preview.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await preview.arrayBuffer()), PNG);

    const download = await api.raw('GET', res.downloadUrl, { user: 2 });
    assert.equal(download.status, 200);
    assert.match(download.headers.get('content-disposition') ?? '', /^attachment; filename="diagram.png"/);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), PNG);
    assert.ok(readdirSync(uploadsDir).some((f) => f.endsWith('.png')));
  });

  it('previews PDFs inline with the PDF content type', async () => {
    const r = await upload(1, meta, { name: 'slides.pdf', data: PDF });
    assert.equal(r.status, 201);
    const preview = await api.raw('GET', r.json.resource.previewUrl, { user: 3 });
    assert.equal(preview.headers.get('content-type'), 'application/pdf');
    assert.match(preview.headers.get('content-disposition') ?? '', /^inline;/);
    assert.deepEqual(Buffer.from(await preview.arrayBuffer()), PDF);
  });

  it('serves the seeded demo files', async () => {
    const pdf = await api.raw('GET', '/api/resources/2/preview', { user: 1 });
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.ok((await pdf.text()).startsWith('%PDF-'));
    const txt = await api.raw('GET', '/api/resources/6/preview', { user: 1 });
    assert.match(txt.headers.get('content-type') ?? '', /^text\/plain/);
  });

  it('requires a demo user for download and preview, and handles links and unknown ids', async () => {
    assert.equal((await api.raw('GET', '/api/resources/2/download')).status, 401);
    assert.equal((await api.raw('GET', '/api/resources/2/preview')).status, 401);
    assert.equal((await api.raw('GET', '/api/resources/2/download', { user: 999 })).status, 401); // unknown demo user
    assert.equal((await api.raw('GET', '/api/resources/1/download', { user: 1 })).status, 404); // link, no file
    assert.equal((await api.raw('GET', '/api/resources/1/preview', { user: 1 })).status, 404);
    assert.equal((await api.raw('GET', '/api/resources/999/download', { user: 1 })).status, 404);
    assert.equal((await api.raw('GET', '/api/resources/abc/preview', { user: 1 })).status, 400);
  });

  it('downloads but does not preview non-previewable types (markdown)', async () => {
    const r = await upload(1, meta, { name: 'notes.md', data: Buffer.from('# Notes\n- item\n') });
    assert.equal(r.status, 201);
    assert.equal(r.json.resource.file.previewable, false);
    assert.equal(r.json.resource.previewUrl, null);
    assert.equal((await api.raw('GET', `/api/resources/${r.json.resource.id}/preview`, { user: 2 })).status, 415);
    const dl = await api.raw('GET', `/api/resources/${r.json.resource.id}/download`, { user: 2 });
    assert.equal(dl.status, 200);
    assert.equal(await dl.text(), '# Notes\n- item\n');
  });

  it('rejects disallowed types, mismatched content, empty files and oversize uploads', async () => {
    const before = readdirSync(uploadsDir).length;
    assert.equal((await upload(1, meta, { name: 'run.exe', data: Buffer.from('MZ....') })).status, 415);
    assert.equal((await upload(1, meta, { name: 'vector.svg', data: Buffer.from('<svg onload="alert(1)"/>') })).status, 415);
    assert.equal((await upload(1, meta, { name: 'page.html', data: Buffer.from('<script>1</script>') })).status, 415);
    assert.equal((await upload(1, meta, { name: 'fake.png', data: Buffer.from('definitely not a png') })).status, 415);
    assert.equal((await upload(1, meta, { name: 'fake.pdf', data: PNG })).status, 415);
    assert.equal((await upload(1, meta, { name: 'binary.txt', data: Buffer.from([0, 1, 2, 3]) })).status, 415);
    assert.equal((await upload(1, meta, { name: 'empty.pdf', data: Buffer.alloc(0) })).status, 415);
    assert.equal((await upload(1, meta, { name: 'noext', data: PNG })).status, 415);
    const big = Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)]);
    assert.equal((await upload(1, meta, { name: 'big.png', data: big })).status, 413);
    assert.equal(readdirSync(uploadsDir).length, before, 'rejected uploads must not leave files behind');
  });

  it('validates metadata and access before storing anything', async () => {
    const file = { name: 'ok.png', data: PNG };
    assert.equal((await upload(undefined, meta, file)).status, 401);
    assert.equal((await upload(1, { ...meta, title: 'ab' }, file)).status, 400);
    assert.equal((await upload(1, { ...meta, type: 'weird' }, file)).status, 400);
    assert.equal((await upload(1, { ...meta, courseId: 'x' }, file)).status, 400);
    assert.equal((await upload(1, { ...meta, courseId: '999' }, file)).status, 404);
    assert.equal((await upload(1, { ...meta, url: 'https://a.edu' }, file)).status, 400); // both file and url
    assert.equal((await upload(1, meta)).status, 400); // multipart with neither
  });

  it('neutralises path traversal in filenames and keeps non-ASCII names', async () => {
    const evil = await upload(1, meta, { name: '../../../etc/passwd.png', data: PNG });
    assert.equal(evil.status, 201);
    assert.equal(evil.json.resource.file.filename, 'passwd.png');
    const jp = await upload(1, meta, { name: '課題ノート.png', data: PNG });
    assert.equal(jp.status, 201);
    assert.equal(jp.json.resource.file.filename, '課題ノート.png');
    const dl = await api.raw('GET', jp.json.resource.downloadUrl, { user: 1 });
    assert.match(dl.headers.get('content-disposition') ?? '', /filename\*=UTF-8''%E8%AA%B2%E9%A1%8C/);
    assert.ok(readdirSync(uploadsDir).every((f) => /^[A-Za-z0-9._-]+$/.test(f)));
  });

  it('shows uploaded resources in the list with vote state', async () => {
    const r = await upload(2, { ...meta, title: 'Votable upload' }, { name: 'v.png', data: PNG });
    const id = r.json.resource.id;
    await api.call('POST', `/api/resources/${id}/upvote`, { user: 1 });
    const list = await api.call('GET', '/api/resources?q=Votable', { user: 1 });
    assert.equal(list.json.resources[0].upvoteCount, 1);
    assert.equal(list.json.resources[0].hasUpvoted, true);
  });
});
