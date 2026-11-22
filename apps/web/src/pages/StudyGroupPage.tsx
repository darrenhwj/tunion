import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { CreateStudyGroupSessionRequest, GetStudyGroupResponse, ListStudyGroupsResponse, ListStudyGroupSessionsResponse, StudyGroupSessionResponse } from '@tunion/shared';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Card from '../components/Card';
import { Empty, Field, PageHeading, Person, field, textLink } from '../components/CommunityUI';
import { MeetingTimes } from '../components/ScheduleFields';
import { api, postJson } from '../lib/api';
import { useDemoAuth } from '../lib/demoAuth';
import { dateTimeJst, timeLabel } from '../lib/schedule';
import { errorMessage, useApiQuery } from '../lib/useApiQuery';

const groupsPath = '/study-groups';
export function fetchStudyGroups(course: string, signal: AbortSignal) {
  const search = course ? '?' + new URLSearchParams({ courseId: course }) : '';
  return api<ListStudyGroupsResponse>(groupsPath + search, { signal });
}
function fetchGroup(id: string, signal: AbortSignal) {
  return api<GetStudyGroupResponse>(groupsPath + '/' + encodeURIComponent(id), { signal });
}
function fetchGroupSessions(id: string, signal: AbortSignal) {
  return api<ListStudyGroupSessionsResponse>(groupsPath + '/' + encodeURIComponent(id) + '/sessions', { signal });
}

export default function StudyGroupPage() {
  const { groupId = '' } = useParams();
  const { current } = useDemoAuth();
  const query = useApiQuery(groupId, fetchGroup);
  const group = query.data?.studyGroup;
  if (!group) return <Empty>{query.error ?? 'Loading study group…'}</Empty>;
  return <>
    <Link className={textLink} to="/groups">← Study groups</Link>
    <PageHeading title={group.name} description={group.description}>
      {current && group.memberIds.includes(current.id) && <Badge tone="brand">Member</Badge>}
    </PageHeading>
    <p className="text-sm text-ink-700">{group.memberIds.length} / {group.maxMembers} members · {group.location}</p>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"><strong>Group members</strong>{group.memberIds.map((id) => <Person key={id} id={id} />)}</div>
    <GroupSessions key={groupId + ':' + current?.id} groupId={groupId} canSchedule={current?.id === group.creatorId} />
  </>;
}

function GroupSessions({ groupId, canSchedule }: { groupId: string; canSchedule: boolean }) {
  const query = useApiQuery(groupId, fetchGroupSessions);
  const { current } = useDemoAuth();
  const { hash } = useLocation();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pending = saving || query.refreshing;

  useEffect(() => {
    if (hash.startsWith('#session-') && query.data) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash, query.data]);

  async function mutate(change: () => Promise<unknown>) {
    setError('');
    setSaving(true);
    try {
      await change();
      setEditing(false);
      query.refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function schedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const read = (key: string) => String(values.get(key) ?? '').trim();
    const payload: CreateStudyGroupSessionRequest = {
      title: read('title'), startsAt: dateTimeJst(read('startsAt')), endsAt: dateTimeJst(read('endsAt')),
      location: read('location') || undefined,
    };
    void mutate(() => postJson<StudyGroupSessionResponse>(groupsPath + '/' + groupId + '/sessions', payload));
  }

  return <section className="space-y-3">
    <div className="flex flex-wrap justify-between gap-3">
      <h2 className="text-xl font-bold">Study sessions</h2>
      {canSchedule && !editing && <Button disabled={pending} onClick={() => { setError(''); setEditing(true); }}>Schedule session</Button>}
    </div>
    {editing && <Card><form onSubmit={schedule}><fieldset disabled={pending} className="min-w-0 space-y-3">
      <Field label="Session title"><input name="title" required minLength={3} maxLength={200} className={field} /></Field>
      <MeetingTimes />
      <Field label="Location"><input name="location" maxLength={300} placeholder="Use group location" className={field} /></Field>
      <div className="flex flex-wrap gap-2"><Button type="submit">Publish session</Button><Button type="button" variant="secondary" onClick={() => { setEditing(false); setError(''); }}>Back</Button></div>
    </fieldset></form></Card>}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    {query.loading || query.error ? <Empty>{query.error ?? 'Loading study sessions…'}</Empty> : query.data?.sessions.length
      ? query.data.sessions.map((session) => <Card key={session.id} id={'session-' + session.id} className="space-y-2">
        <div className="flex flex-wrap gap-2"><Badge tone="brand">{session.courseCode}</Badge><Badge>{session.status}</Badge></div><h3 className="font-bold">{session.title}</h3>
        <p className="text-sm">{timeLabel(session)}</p><p className="break-words text-sm text-ink-500">{session.location}</p>
        {current?.id === session.createdById && session.status === 'scheduled' && <Button disabled={pending} variant="secondary" onClick={() => {
          if (window.confirm('Cancel this study group session?')) void mutate(() => api<StudyGroupSessionResponse>('/study-group-sessions/' + session.id + '/cancel', { method: 'POST' }));
        }}>Cancel session</Button>}
      </Card>) : <Empty>No study sessions yet.</Empty>}
  </section>;
}
