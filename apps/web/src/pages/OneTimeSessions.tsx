import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LOCATION_TYPE_LABELS, type CreateOneTimeSessionRequest, type CreateOneTimeSessionResponse, type GetOneTimeSessionResponse, type ListOneTimeSessionsResponse, type LocationType, type OneTimeSession, type OneTimeSessionResponse } from '@tunion/shared';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Card from '../components/Card';
import { CourseSelect, Empty, Field, PageHeading, Person, field, textLink } from '../components/CommunityUI';
import { LocationField } from '../components/ScheduleFields';
import { api, postJson } from '../lib/api';
import { errorMessage, useApiQuery } from '../lib/useApiQuery';
import { dateTimeJst, newMeetingTimes, timeLabel, todayJst } from '../lib/schedule';

const path = '/one-time-sessions';

function fetchSessions(course: string, signal: AbortSignal) {
  const params = new URLSearchParams({ limit: '100' });
  if (course && course !== 'mine') params.set('courseId', course);
  return api<ListOneTimeSessionsResponse>(path + '?' + params, { signal });
}

function fetchSession(id: string, signal: AbortSignal) {
  return api<GetOneTimeSessionResponse>(path + '/' + encodeURIComponent(id), { signal });
}

export default function OneTimeSessions({ course, enrolled }: { course: string; enrolled: number[] }) {
  const query = useApiQuery(course, fetchSessions);
  const [initial, setInitial] = useState<ReturnType<typeof newMeetingTimes> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const items = (query.data?.sessions ?? []).filter((session) => course !== 'mine' || enrolled.includes(session.courseId));

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const read = (name: string) => String(form.get(name) ?? '').trim();
    const startsAt = dateTimeJst(read('date') + 'T' + read('startTime'));
    const endsAt = dateTimeJst(read('date') + 'T' + read('endTime'));
    const start = Date.parse(startsAt);
    const end = Date.parse(endsAt);
    const title = read('title');
    const description = read('description');
    if (title.length < 3 || !description || !Number.isFinite(start) || !Number.isFinite(end) || start <= Date.now() || end <= start) {
      setError('Enter a title and topic, and choose a future start with a later end time on the same date.');
      return;
    }

    const locationType = read('locationType') as LocationType;
    const request: CreateOneTimeSessionRequest = {
      courseId: Number(read('courseId')), title, description, startsAt, endsAt,
      location: [LOCATION_TYPE_LABELS[locationType], read('locationDetails')].filter(Boolean).join(' · '),
      maxParticipants: Number(read('maxParticipants')),
    };
    setSaving(true);
    setError('');
    try {
      await postJson<CreateOneTimeSessionResponse>(path, request);
      setInitial(null);
      query.refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-xl font-bold">One-time study sessions</h2>
      <Button disabled={saving} variant={initial ? 'secondary' : 'primary'} onClick={() => { setInitial(initial ? null : newMeetingTimes()); setError(''); }}>{initial ? 'Cancel session form' : 'Create one-time session'}</Button>
    </div>
    {initial && <Card><form className="space-y-4" onSubmit={create}>
      <Field label="Session course"><CourseSelect defaultValue={course === 'mine' ? undefined : course} /></Field>
      <Field label="Session title"><input name="title" className={field} minLength={3} maxLength={200} required /></Field>
      <Field label="Description or topic"><textarea name="description" className={field} maxLength={2000} rows={3} required /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Date (JST)"><input type="date" name="date" defaultValue={initial.startsAt.slice(0, 10)} min={todayJst()} className={field} required /></Field>
        <Field label="Start time (JST)"><input type="time" name="startTime" defaultValue={initial.startsAt.slice(11)} className={field} required /></Field>
        <Field label="End time (JST)"><input type="time" name="endTime" defaultValue={initial.startsAt.slice(0, 10) === initial.endsAt.slice(0, 10) ? initial.endsAt.slice(11) : '23:59'} className={field} required /></Field>
      </div>
      <LocationField />
      <Field label="Meeting details or link"><input name="locationDetails" maxLength={280} className={field} /></Field>
      <Field label="Participant limit"><input type="number" name="maxParticipants" min={2} max={50} defaultValue={10} required className={field} /></Field>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <Button type="submit" disabled={saving}>{saving ? 'Publishing…' : 'Publish one-time session'}</Button>
    </form></Card>}
    {query.loading || query.error ? <Empty>{query.error ?? 'Loading one-time sessions…'}</Empty>
      : items.length ? items.map((session) => <SessionCard key={session.id} session={session} refresh={query.refresh} refreshing={query.refreshing} />)
      : <Empty>No one-time sessions match this course filter.</Empty>}
  </section>;
}

export function OneTimeSessionPage() {
  const { sessionId = '' } = useParams();
  const query = useApiQuery(sessionId, fetchSession);
  const session = query.data?.session;
  return <>
    <Link to="/groups" className={textLink}>← Study groups</Link>
    {session ? <>
      <PageHeading title={session.title} description={session.courseTitle} />
      <SessionCard key={session.id} session={session} refresh={query.refresh} refreshing={query.refreshing} detail />
    </> : <Empty>{query.error ?? 'Loading one-time session…'}</Empty>}
  </>;
}

function SessionCard({ session, refresh, refreshing, detail = false }: { session: OneTimeSession; refresh: () => void; refreshing: boolean; detail?: boolean }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const started = Date.parse(session.startsAt) <= Date.now();
  const full = session.participantCount >= session.maxParticipants;

  async function change(action: 'join' | 'leave' | 'cancel') {
    setSaving(true);
    setError('');
    try {
      await api<OneTimeSessionResponse>(path + '/' + session.id + '/' + (action === 'leave' ? 'join' : action), { method: action === 'leave' ? 'DELETE' : 'POST' });
      refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return <Card className="space-y-2">
    <div className="flex flex-wrap gap-2">
      <Badge tone="brand">{session.courseCode}</Badge>
      <Badge>{session.status === 'cancelled' ? 'Cancelled' : 'One-time'}</Badge>
      {session.isParticipant && <Badge tone="brand">Joined session</Badge>}
    </div>
    {!detail && <h3 className="break-words font-bold"><Link className={textLink} to={'/groups/one-time/' + session.id}>{session.title}</Link></h3>}
    <p className="whitespace-pre-wrap break-words text-sm">{session.description}</p>
    <p className="text-sm">{timeLabel(session)}</p>
    <p className="break-words text-sm">{session.location}</p>
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm"><strong>Participants ({session.participantCount}/{session.maxParticipants})</strong>{session.participants.map(({ id }) => <Person key={id} id={id} />)}</div>
    {session.status === 'scheduled' && <div className="flex flex-wrap gap-2">
      {!session.isParticipant && !started && <Button variant="secondary" disabled={full || saving || refreshing} onClick={() => void change('join')}>{full ? 'Session full' : 'Join one-time session'}</Button>}
      {session.isParticipant && !session.isCreator && <Button variant="secondary" disabled={saving || refreshing} onClick={() => void change('leave')}>Leave session</Button>}
      {session.isCreator && <Button variant="secondary" disabled={saving || refreshing} onClick={() => {
        if (window.confirm('Cancel this one-time session?')) void change('cancel');
      }}>Cancel session</Button>}
    </div>}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
  </Card>;
}
