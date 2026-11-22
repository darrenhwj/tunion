import AccountBadges from '../components/AccountBadges';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { LOCATION_TYPE_LABELS, type AvailabilitySlot, type CreateAvailabilitySlotRequest, type CreateAvailabilitySlotResponse, type DayOfWeek, type DeleteResponse, type ListAvailabilityResponse, type LocationType, type UpdateAvailabilitySlotResponse } from '@tunion/shared';
import Button from '../components/Button';
import Card from '../components/Card';
import { Empty, Field, PageHeading, field, textLink } from '../components/CommunityUI';
import { LocationField } from '../components/ScheduleFields';
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
    <PageHeading title="My availability" description="Manage your recurring weekly tutoring hours in Japan Standard Time (JST).">{current && <AccountBadges role={current.role} />}</PageHeading>
    {current ? <AvailabilityEditor key={current.id} /> : <Empty>Select a tutor account to manage availability.</Empty>}
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
