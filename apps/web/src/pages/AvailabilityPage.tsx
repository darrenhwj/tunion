import AccountBadges from '../components/AccountBadges';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { LOCATION_TYPE_LABELS, type GetMyTutorResponse, type SetTutorSubjectsRequest, type SetTutorSubjectsResponse, type AvailabilitySlot, type CreateAvailabilitySlotRequest, type CreateAvailabilitySlotResponse, type DayOfWeek, type DeleteResponse, type ListAvailabilityResponse, type LocationType, type UpdateAvailabilitySlotResponse } from '@tunion/shared';
import Button from '../components/Button';
import Card from '../components/Card';
import { Empty, Field, PageHeading, field, textLink } from '../components/CommunityUI';
import { LocationField } from '../components/ScheduleFields';
import { useCommunity } from '../demo/community';
import { api, postJson } from '../lib/api';
import { useDemoAuth } from '../lib/demoAuth';
import { weekdays } from '../lib/schedule';
import { errorMessage, useApiQuery } from '../lib/useApiQuery';

const path = '/tutors/me/availability';
function loadAvailability(_key: string, signal: AbortSignal) {
  return api<ListAvailabilityResponse>(path, { signal });
}

export default function AvailabilityPage() {
  const { current } = useDemoAuth();
  return <>
    <Link to="/tutoring" className={textLink}>← Tutor directory</Link>
    <PageHeading title="My tutor settings" description="Choose the courses you tutor and manage your recurring weekly hours in Japan Standard Time (JST). Students can only book you once both are set.">{current && <AccountBadges role={current.role} />}</PageHeading>
    {current?.isTutor ? <><SubjectsEditor key={'s' + current.id} /><AvailabilityEditor key={current.id} /></>
      : <Empty>{current ? 'Only accounts with a Tutor badge have tutor settings. Ask an admin to grant the badge.' : 'Select a tutor account to manage availability.'}</Empty>}
  </>;
}

function AvailabilityEditor() {
  const query = useApiQuery('', loadAvailability);
  const [editing, setEditing] = useState<AvailabilitySlot | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = busy || query.refreshing;

  async function mutate(change: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await change();
      setEditing(null);
      query.refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const request: CreateAvailabilitySlotRequest = {
      dayOfWeek: Number(form.get('dayOfWeek')) as DayOfWeek,
      startTime: String(form.get('startTime')),
      endTime: String(form.get('endTime')),
      locationType: form.get('locationType') as LocationType,
    };
    if (request.endTime <= request.startTime) {
      setError('End time must be after start time.');
      return;
    }
    if (!editing || editing === 'new') {
      void mutate(() => postJson<CreateAvailabilitySlotResponse>(path, request));
    } else {
      void mutate(() => api<UpdateAvailabilitySlotResponse>(path + '/' + editing.id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
      }));
    }
  }

  if (!query.data) return <Empty>{query.error ?? 'Loading availability…'}</Empty>;
  const slot = editing === 'new' ? undefined : editing ?? undefined;
  return <div className="space-y-4">
    {editing ? <Card>
      <h2 className="mb-4 font-bold">{slot ? 'Edit weekly slot' : 'Add weekly slot'}</h2>
      <form key={slot?.id ?? 'new'} onSubmit={save}><fieldset disabled={pending} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Day"><select name="dayOfWeek" defaultValue={slot?.dayOfWeek ?? 1} className={field}>{weekdays.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></Field>
          <LocationField value={slot?.locationType} />
          <Field label="Start time (JST)"><input name="startTime" type="time" className={field} required defaultValue={slot?.startTime} /></Field>
          <Field label="End time (JST)"><input name="endTime" type="time" className={field} required defaultValue={slot?.endTime} /></Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit">Save slot</Button>
          <Button type="button" variant="secondary" onClick={() => { setEditing(null); setError(''); }}>Cancel edit</Button>
        </div>
      </fieldset></form>
    </Card> : <Button disabled={pending} onClick={() => { setError(''); setEditing('new'); }}>Add weekly slot</Button>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {query.data.slots.length ? query.data.slots.map((item) => <Card key={item.id} className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold">{weekdays[item.dayOfWeek]} · {item.startTime}–{item.endTime} JST</h2><p className="text-sm text-ink-500">{LOCATION_TYPE_LABELS[item.locationType]}</p></div>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => { setError(''); setEditing(item); }}>Edit</Button>
        <Button variant="ghost" disabled={pending} onClick={() => {
          if (window.confirm('Remove this weekly availability slot?')) void mutate(() => api<DeleteResponse>(path + '/' + item.id, { method: 'DELETE' }));
        }}>Remove</Button>
      </div>
    </Card>) : <Empty>No weekly slots yet.</Empty>}
  </div>;
}

function loadMyTutor(_key: string, signal: AbortSignal) {
  return api<GetMyTutorResponse>('/tutors/me', { signal });
}

/** Subjects are chosen explicitly here; they are never copied from the courses a tutor has taken. */
function SubjectsEditor() {
  const { courses } = useCommunity();
  const query = useApiQuery('', loadMyTutor);
  const [selected, setSelected] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const savedIds = query.data?.tutor.courseIds;
  useEffect(() => { if (savedIds) setSelected(savedIds); }, [savedIds]);
  if (!query.data || !selected) return <Empty>{query.error ?? 'Loading subjects…'}</Empty>;
  const chosen = selected;

  async function save() {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await api<SetTutorSubjectsResponse>('/tutors/me/subjects', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseIds: chosen } satisfies SetTutorSubjectsRequest),
      });
      setSaved(true);
      query.refresh();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: number) => { setSaved(false); setSelected((previous) => (previous ?? []).includes(id) ? (previous ?? []).filter((item) => item !== id) : [...(previous ?? []), id]); };
  return <Card className="space-y-3">
    <h2 className="font-bold">Subjects I tutor</h2>
    {!chosen.length && <p className="text-sm text-ink-500">No subjects chosen yet, so students cannot book you.</p>}
    <fieldset disabled={busy} className="grid gap-2 sm:grid-cols-2">
      <legend className="sr-only">Courses you tutor</legend>
      {courses.map((course) => <label key={course.id} className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={chosen.includes(course.id)} onChange={() => toggle(course.id)} />
        <span>{course.code} · {course.title}</span>
      </label>)}
    </fieldset>
    <Button disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save subjects'}</Button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {saved && <p role="status" className="text-sm text-brand-700">Subjects saved.</p>}
  </Card>;
}
