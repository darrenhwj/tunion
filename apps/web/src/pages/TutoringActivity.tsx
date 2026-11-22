import AccountBadges from '../components/AccountBadges';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { AcceptTutoringRequestResponse, ApproveTutoringRequestRequest, ConfirmTutoringRequestResponse, ListTutoringRequestsResponse, ListTutoringSessionsResponse, LocationType, RejectTutoringRequestRequest, TutoringRequestDetail, TutoringRequestResponse, TutoringSessionResponse } from '@tunion/shared';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Card from '../components/Card';
import { Empty, Field, PageHeading, field, textLink } from '../components/CommunityUI';
import { LocationField, MeetingTimes } from '../components/ScheduleFields';
import { api, postJson } from '../lib/api';
import { useDemoAuth } from '../lib/demoAuth';
import { dateTimeJst, locationLabel, timeLabel } from '../lib/schedule';
import { errorMessage, useApiQuery } from '../lib/useApiQuery';

const requestsPath = '/tutoring-requests';
const sessionsPath = '/tutoring-sessions';
function fetchRequests(_key: string, signal: AbortSignal) {
  return api<ListTutoringRequestsResponse>(requestsPath, { signal });
}
function fetchIncomingRequests(_key: string, signal: AbortSignal) {
  return api<ListTutoringRequestsResponse>(requestsPath + '?role=tutor&status=open', { signal });
}

export function IncomingTutoringRequests({ userId, onChange }: { userId: number; onChange: () => void }) {
  const query = useApiQuery('', fetchIncomingRequests);
  const requests = query.data?.requests.filter((request) => request.tutor?.id === userId && request.studentId !== userId && request.status === 'open') ?? [];
  if (!requests.length) return null;
  return <section aria-labelledby="incoming-tutoring" className="space-y-3">
    <h2 id="incoming-tutoring" className="text-xl font-bold tracking-tight">Incoming Tutoring Requests ({requests.length})</h2>
    {requests.map((request) => <RequestCard key={request.id} request={request} userId={userId} refreshing={query.refreshing}
      refresh={() => { query.refresh(); onChange(); }} />)}
  </section>;
}

function fetchSessions(_key: string, signal: AbortSignal) {
  return api<ListTutoringSessionsResponse>(sessionsPath, { signal });
}
function fetchSession(id: string, signal: AbortSignal) {
  return api<TutoringSessionResponse>(sessionsPath + '/' + encodeURIComponent(id), { signal });
}

export function TutoringActivity({ userId }: { userId: number }) {
  const requests = useApiQuery('', fetchRequests);
  const sessions = useApiQuery('', fetchSessions);
  const { hash } = useLocation();
  const requestsLoaded = !requests.loading;
  useEffect(() => {
    if (hash === '#requests' && requestsLoaded) document.getElementById('requests')?.scrollIntoView();
  }, [hash, requestsLoaded]);

  function refresh() {
    requests.refresh();
    sessions.refresh();
  }
  return <>
    <section id="requests" className="space-y-3">
      <h2 className="text-xl font-bold">My help requests</h2>
      {requests.loading || requests.error ? <Empty>{requests.error ?? 'Loading requests…'}</Empty> : requests.data?.requests.length
        ? requests.data.requests.map((request) => <RequestCard key={request.id} request={request} userId={userId} refresh={refresh} refreshing={requests.refreshing} />)
        : <Empty>No help requests yet.</Empty>}
    </section>
    <section className="space-y-3">
      <h2 className="text-xl font-bold">My tutoring sessions</h2>
      {sessions.loading || sessions.error ? <Empty>{sessions.error ?? 'Loading sessions…'}</Empty> : sessions.data?.sessions.length
        ? sessions.data.sessions.map((session) => <Card key={session.id} className="space-y-2">
          <Badge>{session.status}</Badge>
          <p><Link className={textLink} to={'/tutoring/sessions/' + session.id}>{session.courseCode} · {session.courseTitle}</Link></p>
          <p className="text-sm text-ink-700">{timeLabel(session)} · {locationLabel(session)}</p>
        </Card>) : <Empty>No tutoring sessions yet.</Empty>}
    </section>
  </>;
}

function RequestCard({ request, userId, refresh, refreshing }: { request: TutoringRequestDetail; userId: number; refresh: () => void; refreshing: boolean }) {
  const [editing, setEditing] = useState<'accept' | 'approve' | 'reject' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pending = refreshing || saving;
  const sent = request.studentId === userId;
  const requested = request.requestedMeeting;
  const duration = requested ? (Date.parse(requested.endsAt) - Date.parse(requested.startsAt)) / 60_000 : undefined;
  const path = requestsPath + '/' + request.id;

  async function mutate(change: () => Promise<unknown>) {
    setSaving(true);
    setError('');
    try {
      await change();
      setEditing(null);
      refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const read = (key: string) => String(values.get(key) ?? '').trim();
    if (editing === 'reject') {
      const payload: RejectTutoringRequestRequest = { note: read('note') };
      void mutate(() => postJson<TutoringRequestResponse>(path + '/reject', payload));
      return;
    }
    if (editing === 'accept') {
      void mutate(() => api<AcceptTutoringRequestResponse>(path + '/accept', { method: 'POST' }));
      return;
    }
    const payload: ApproveTutoringRequestRequest = {
      startsAt: dateTimeJst(read('startsAt')), endsAt: dateTimeJst(read('endsAt')),
      locationType: read('locationType') as LocationType, locationDetails: read('locationDetails'), note: read('note'),
    };
    void mutate(() => postJson<TutoringRequestResponse>(path + '/approve', payload));
  }

  return <Card className="space-y-3">
    <div className="flex flex-wrap gap-2"><Badge tone="brand">{request.courseCode}</Badge><Badge>{request.status === 'accepted' ? 'Awaiting student confirmation' : request.status}</Badge></div>
    <h3 className="break-words font-bold">{request.topic}</h3>
    <p className="text-sm text-ink-500">{sent ? 'To ' + (request.tutor?.name ?? 'peer tutor') : 'From ' + request.student.name}{request.slotId !== null && ' · Weekly slot requested'}</p>
    {request.details && <p className="whitespace-pre-wrap break-words text-sm">{request.details}</p>}
    {requested && request.status === 'open' && <div className="rounded-lg bg-canvas p-3 text-sm">
      <p className="font-semibold">{timeLabel(requested)} · {duration} min</p>
      <p className="break-words">{locationLabel(requested)}</p>
    </div>}
    {request.proposal && <div className="rounded-lg bg-canvas p-3 text-sm"><p className="font-semibold">{timeLabel(request.proposal)}</p><p className="break-words">{locationLabel(request.proposal)}</p></div>}
    {request.tutorNote && <p className="whitespace-pre-wrap break-words text-sm text-ink-700">{request.tutorNote}</p>}
    {request.sessionId && <Link className={textLink} to={'/tutoring/sessions/' + request.sessionId}>View session →</Link>}
    {!sent && request.status === 'open' && !editing && <div className="flex flex-wrap gap-2">
      {requested && <Button disabled={pending} onClick={() => setEditing('accept')}>Accept</Button>}
      <Button disabled={pending} variant={requested ? 'secondary' : 'primary'} onClick={() => setEditing('approve')}>{requested ? 'Propose Another Time' : 'Propose a meeting'}</Button>
      <Button disabled={pending} variant="secondary" onClick={() => setEditing('reject')}>Decline</Button>
    </div>}
    {!sent && request.status === 'open' && editing && <form onSubmit={submit}><fieldset className="min-w-0 space-y-3" disabled={pending}>
      {editing === 'accept' && requested && <p className="text-sm">Confirm {timeLabel(requested)} · {locationLabel(requested)}</p>}
      {editing === 'approve' && <>
        <p className="text-sm">Choose a time and format within your weekly availability. <Link className={textLink} to="/tutoring/availability">View availability</Link></p>
        <MeetingTimes durationMinutes={duration} /><LocationField value={requested?.locationType} />
        <Field label="Location details"><input name="locationDetails" defaultValue={requested?.locationDetails} maxLength={300} className={field} /></Field>
      </>}
      {editing !== 'accept' && <Field label="Note to student"><textarea name="note" maxLength={1000} className={field} rows={2} /></Field>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit">{editing === 'accept' ? 'Confirm requested time' : editing === 'approve' ? 'Send proposal' : 'Decline request'}</Button>
        {editing === 'accept' && <Button type="button" variant="secondary" onClick={() => { setEditing('approve'); setError(''); }}>Propose Another Time</Button>}
        <Button type="button" variant="secondary" onClick={() => { setEditing(null); setError(''); }}>Back</Button>
      </div>
    </fieldset></form>}
    {sent && (request.status === 'open' || request.status === 'accepted') && <div className="flex flex-wrap gap-2">
      {request.status === 'accepted' && <Button disabled={pending} onClick={() => void mutate(() => api<ConfirmTutoringRequestResponse>(path + '/confirm', { method: 'POST' }))}>Confirm session</Button>}
      <Button disabled={pending} variant="secondary" onClick={() => void mutate(() => api<TutoringRequestResponse>(path + '/cancel', { method: 'POST' }))}>Withdraw request</Button>
    </div>}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
  </Card>;
}

export function TutoringSessionPage() {
  const { current } = useDemoAuth();
  const { sessionId = '' } = useParams();
  return <>
    <Link to="/tutoring" className={textLink}>← Tutoring</Link>
    {current ? <SessionDetails key={current.id + ':' + sessionId} id={sessionId} userId={current.id} /> : <Empty>Select a demo account to view this session.</Empty>}
  </>;
}

function SessionDetails({ id, userId }: { id: string; userId: number }) {
  const query = useApiQuery(id, fetchSession);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const session = query.data?.session;
  if (!session) return <Empty>{query.error ?? 'Loading session…'}</Empty>;
  const pending = saving || query.refreshing;

  async function change(action: 'cancel' | 'complete') {
    setSaving(true);
    setError('');
    try {
      await api<TutoringSessionResponse>(sessionsPath + '/' + id + '/' + action, { method: 'POST' });
      query.refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return <>
    <PageHeading title={session.courseCode + ' tutoring session'} description={session.courseTitle}><Badge>{session.status}</Badge></PageHeading>
    <Card className="space-y-3">
      <p className="font-semibold">{timeLabel(session)}</p>
      <p className="break-words">{locationLabel(session)}</p>
      <p className="text-sm text-ink-500">Providing · {session.tutor.name} <AccountBadges role={session.tutor.role} tutor /></p>
      <p className="text-sm text-ink-500">Receiving · {session.student.name} <AccountBadges role={session.student.role} /></p>
      {session.status === 'scheduled' && <div className="flex flex-wrap gap-2">
        {session.tutor.id === userId && Date.parse(session.startsAt) <= Date.now() && <Button disabled={pending} onClick={() => void change('complete')}>Mark complete</Button>}
        <Button variant="secondary" disabled={pending} onClick={() => { if (window.confirm('Cancel this tutoring session?')) void change('cancel'); }}>Cancel session</Button>
      </div>}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </Card>
  </>;
}
