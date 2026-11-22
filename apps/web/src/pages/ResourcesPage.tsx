import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { RESOURCE_UPLOAD_LIMITS, type CreateResourceRequest, type CreateResourceResponse, type GetResourceResponse, type ResourceSummary, type ResourceType, type VoteResponse } from '@tunion/shared';
import Badge from '../components/Badge';
import Button from '../components/Button';
import ResourcePreview from '../components/ResourcePreview';
import Card from '../components/Card';
import { CourseSelect, Empty, Field, PageHeading, Person, RequireAccount, field, textLink } from '../components/CommunityUI';
import { api, apiResponse, postJson } from '../lib/api';
import { fetchResources } from '../lib/resources';
import { errorMessage, useApiQuery } from '../lib/useApiQuery';
import { useDemoAuth } from '../lib/demoAuth';

const types: Record<ResourceType, string> = { notes: 'Notes', link: 'Link', cheatsheet: 'Cheat sheet', practice: 'Practice', other: 'Other' };

export function ResourceList({ items }: { items: ResourceSummary[] }) {
  const { current } = useDemoAuth();
  if (!items.length) return <Empty>No resources found.</Empty>;
  return <div className="space-y-3">{items.map((resource) => <Card key={current?.id + ':' + resource.id} className="flex flex-wrap items-start justify-between gap-4">
    <div className="min-w-0 space-y-2">
      <div className="flex gap-2"><Badge tone="brand">{types[resource.type]}</Badge><Badge>{resource.courseCode}</Badge></div>
      <h2 className="font-bold break-words">{resource.title}</h2>
      <p className="text-sm break-words text-ink-700">{resource.description}</p>
      <p className="text-xs text-ink-500"><Person id={resource.authorId} /></p>
    </div>
    <div className="space-y-2">
      <ResourceControl resource={resource} />
      <ResourceVote resource={resource} canVote={!!current && current.id !== resource.authorId} />
    </div>
  </Card>)}</div>;
}

function ResourceVote({ resource, canVote }: { resource: ResourceSummary; canVote: boolean }) {
  const [updated, setUpdated] = useState<VoteResponse>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const vote = updated ?? resource;
  const path = '/resources/' + resource.id;

  async function toggle() {
    setPending(true);
    setError('');
    try {
      setUpdated(await api<VoteResponse>(path + '/upvote', { method: vote.hasUpvoted ? 'DELETE' : 'POST' }));
    } catch (error) {
      setError(errorMessage(error));
      // The same account may have already voted in another tab.
      try {
        const { resource } = await api<GetResourceResponse>(path);
        setUpdated(resource);
      } catch { /* Keep the last confirmed count. */ }
    } finally {
      setPending(false);
    }
  }

  return <div className="space-y-1">
    <div className="flex flex-wrap items-center gap-2">
      <Button aria-label="Upvote resource" aria-pressed={vote.hasUpvoted} variant={vote.hasUpvoted ? 'primary' : 'secondary'} disabled={!canVote || pending} onClick={() => void toggle()}>↑ Upvote</Button>
      <span aria-live="polite" className="text-xs text-ink-500">{vote.upvoteCount} {vote.upvoteCount === 1 ? 'upvote' : 'upvotes'}</span>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}

function ResourceControl({ resource }: { resource: ResourceSummary }) {
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [preview, setPreview] = useState(false);
  const { url, file, downloadUrl } = resource;


  async function download() {
    if (!downloadUrl || !file) return;
    setWorking(true);
    setError('');
    try {
      const objectUrl = URL.createObjectURL(await (await apiResponse(downloadUrl)).blob());
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = file.filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to download file.');
    } finally {
      setWorking(false);
    }
  }

  if (url) return <a href={url} target="_blank" rel="noreferrer" className={textLink}>Open link ↗</a>;
  if (!file || !downloadUrl) return <p className="text-sm text-ink-500">File unavailable</p>;
  const downloadControl = <Button variant="secondary" disabled={working} onClick={download}>{working ? 'Preparing…' : 'Download'}</Button>;
  const downloadError = error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>;
  return <>
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" onClick={() => { setError(''); setPreview(true); }}>{resource.previewUrl ? 'Preview' : 'File details'}</Button>
      {downloadControl}
    </div>
    {!preview && downloadError}
    {preview && <ResourcePreview resource={resource} close={() => setPreview(false)} download={<>{downloadControl}{downloadError}</>} />}
  </>;
}

export default function ResourcesPage() {
  const { courseId } = useParams();
  const { current } = useDemoAuth();
  const [course, setCourse] = useState('');
  const [filter, setFilter] = useState('');
  const params = new URLSearchParams();
  const selectedCourse = courseId || course;
  if (selectedCourse) params.set('courseId', selectedCourse);
  if (filter) params.set('type', filter);
  const query = useApiQuery(params.toString(), fetchResources);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current || uploading) return;
    const form = new FormData(event.currentTarget);
    const file = form.get('file');
    const upload = file instanceof File && file.name ? file : null;
    const link = String(form.get('url') ?? '').trim();
    const title = String(form.get('title')).trim();
    if (!title) return;
    if (!upload && !/^https?:\/\//i.test(link)) {
      setError('Choose a file or provide an HTTP or HTTPS link.');
      return;
    }
    if (upload && link) {
      setError('Choose either a file or a link.');
      return;
    }
    if (upload && upload.size > RESOURCE_UPLOAD_LIMITS.maxBytes) {
      setError('Files must be 10 MB or smaller.');
      return;
    }
    setError('');
    setUploading(true);
    try {
      const request: CreateResourceRequest = {
        courseId: Number(courseId ?? form.get('courseId')), title,
        description: String(form.get('description')).trim(), type: form.get('type') as ResourceType,
      };
      if (upload) {
        const multipart = new FormData();
        Object.entries(request).forEach(([key, value]) => multipart.set(key, String(value)));
        multipart.set('file', upload);
        await api<CreateResourceResponse>('/resources', { method: 'POST', body: multipart });
      } else {
        await postJson<CreateResourceResponse>('/resources', { ...request, url: link });
      }
      query.refresh();
      setEditing(false);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  const button = <Button onClick={() => { setEditing(!editing); setError(''); }} disabled={uploading} variant={editing ? 'secondary' : 'primary'}>{editing ? 'Cancel' : 'Share resource'}</Button>;
  return <>
    {courseId ? <div className="flex justify-end">{button}</div> : <PageHeading title="Resources" description="Find notes, practice material, and references shared by classmates.">{button}</PageHeading>}
    {editing && <RequireAccount><Card className="max-w-2xl"><form onSubmit={submit} className="space-y-4">
      {!courseId && <Field label="Course"><CourseSelect defaultValue={course} /></Field>}
      <Field label="Title"><input name="title" className={field} required minLength={3} maxLength={200} pattern=".*\S.*" /></Field>
      <Field label="Description"><textarea name="description" className={field} maxLength={2000} rows={3} /></Field>
      <Field label="Type"><select name="type" className={field}>{Object.entries(types).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></Field>
      <Field label="Upload a file"><input name="file" type="file" className={field} accept={RESOURCE_UPLOAD_LIMITS.extensions.map((extension) => '.' + extension).join(',')} /></Field>
      <Field label="Or add a link"><input name="url" type="url" className={field} placeholder="https://" /></Field>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <Button type="submit" disabled={uploading}>{uploading ? 'Saving…' : 'Publish resource'}</Button>
    </form></Card></RequireAccount>}
    <div className="grid gap-3 sm:grid-cols-2">
      {!courseId && <Field label="Course"><CourseSelect all value={course} onChange={setCourse} /></Field>}
      <Field label="Type"><select className={field} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">All types</option>{Object.entries(types).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></Field>
    </div>
    {query.loading || query.error ? <Empty>{query.error ?? 'Loading resources…'}</Empty> : <ResourceList items={query.data ?? []} />}
  </>;
}
