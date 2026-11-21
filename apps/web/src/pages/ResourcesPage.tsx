import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import type { ResourceType } from '@tunion/shared';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Card from '../components/Card';
import { CourseSelect, Empty, Field, PageHeading, Person, RequireAccount, field, textLink } from '../components/CommunityUI';
import { nextId, useCommunity } from '../demo/community';
import { loadFile, saveFile } from '../demo/files';
import type { DemoResource } from '../demo/data';
import { useDemoAuth } from '../lib/demoAuth';

const types: Record<ResourceType, string> = { notes: 'Notes', link: 'Link', cheatsheet: 'Cheat sheet', practice: 'Practice', other: 'Other' };

export function ResourceList({ items }: { items: DemoResource[] }) {
  const { courses } = useCommunity();
  if (!items.length) return <Empty>No resources found.</Empty>;
  return <div className="space-y-3">{items.map((resource) => <Card key={resource.id} className="flex flex-wrap items-start justify-between gap-4">
    <div className="min-w-0 space-y-2">
      <div className="flex gap-2"><Badge tone="brand">{types[resource.type]}</Badge><Badge>{courses.find((course) => course.id === resource.courseId)?.code ?? 'Course'}</Badge></div>
      <h2 className="font-bold break-words">{resource.title}</h2>
      <p className="text-sm break-words text-ink-700">{resource.description}</p>
      <p className="text-xs text-ink-500"><Person id={resource.authorId} /></p>
    </div>
    <ResourceControl resource={resource} />
  </Card>)}</div>;
}

function ResourceControl({ resource }: { resource: DemoResource }) {
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const { url, filename } = resource;
  if (!url) return null;

  async function download() {
    if (!url || !filename) return;
    setWorking(true);
    setError('');
    try {
      const objectUrl = URL.createObjectURL(await loadFile(url));
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to download file.');
    } finally {
      setWorking(false);
    }
  }

  if (url.startsWith('local-file:')) return <div><Button variant="secondary" disabled={working} onClick={download}>{working ? 'Preparing…' : 'Download'}</Button>{error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}</div>;
  return filename
    ? <a href={url} download={filename} className={textLink}>Download</a>
    : <a href={url} target="_blank" rel="noreferrer" className={textLink}>Open link ↗</a>;
}

export default function ResourcesPage() {
  const { courseId } = useParams();
  const { data, update } = useCommunity();
  const { current } = useDemoAuth();
  const [course, setCourse] = useState('');
  const [filter, setFilter] = useState('');
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
    setError('');
    setUploading(true);
    try {
      const url = upload ? await saveFile(upload) : link;
      update((previous) => ({ ...previous, resources: [{
        id: nextId(previous.resources), authorId: current.id, courseId: Number(courseId ?? form.get('courseId')),
        title, description: String(form.get('description')).trim(), type: form.get('type') as ResourceType,
        url, filename: upload?.name, createdAt: new Date().toISOString(),
      }, ...previous.resources] }));
      setEditing(false);
    } catch {
      setError('The file could not be saved in this browser.');
    } finally {
      setUploading(false);
    }
  }

  const button = <Button onClick={() => { setEditing(!editing); setError(''); }} disabled={uploading} variant={editing ? 'secondary' : 'primary'}>{editing ? 'Cancel' : 'Share resource'}</Button>;
  return <>
    {courseId ? <div className="flex justify-end">{button}</div> : <PageHeading title="Resources" description="Find notes, practice material, and references shared by classmates.">{button}</PageHeading>}
    {editing && <RequireAccount><Card className="max-w-2xl"><form onSubmit={submit} className="space-y-4">
      {!courseId && <Field label="Course"><CourseSelect defaultValue={course} /></Field>}
      <Field label="Title"><input name="title" className={field} required pattern=".*\S.*" /></Field>
      <Field label="Description"><textarea name="description" className={field} rows={3} /></Field>
      <Field label="Type"><select name="type" className={field}>{Object.entries(types).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></Field>
      <Field label="Upload a file"><input name="file" type="file" className={field} /></Field>
      <Field label="Or add a link"><input name="url" type="url" className={field} placeholder="https://" /></Field>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <Button type="submit" disabled={uploading}>{uploading ? 'Saving…' : 'Publish resource'}</Button>
    </form></Card></RequireAccount>}
    <div className="grid gap-3 sm:grid-cols-2">
      {!courseId && <Field label="Course"><CourseSelect all value={course} onChange={setCourse} /></Field>}
      <Field label="Type"><select className={field} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">All types</option>{Object.entries(types).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></Field>
    </div>
    <ResourceList items={data.resources.filter((resource) => (!(courseId || course) || String(resource.courseId) === (courseId || course)) && (!filter || resource.type === filter))} />
  </>;
}
