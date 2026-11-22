import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { APP_TIME_ZONE, type LocationType } from '@tunion/shared';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Card from '../components/Card';
import { CourseSelect, Empty, Field, Person, field } from '../components/CommunityUI';
import { LocationField } from '../components/ScheduleFields';
import { nextId, useCommunity } from '../demo/community';
import type { DemoStudySession } from '../demo/data';
import { useDemoAuth } from '../lib/demoAuth';
import { dateTimeJst, locationLabel, timeLabel, todayJst } from '../lib/schedule';

export default function OneTimeSessions({ items }: { items: DemoStudySession[] }) {
  const { hash } = useLocation();
  const { current } = useDemoAuth();
  const { courses, update } = useCommunity();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (hash.startsWith('#one-time-')) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current) return;
    const form = new FormData(event.currentTarget);
    const read = (name: string) => String(form.get(name) ?? '').trim();
    const startsAtJst = dateTimeJst(read('date') + 'T' + read('startTime'));
    const endsAtJst = dateTimeJst(read('date') + 'T' + read('endTime'));
    const start = Date.parse(startsAtJst);
    const end = Date.parse(endsAtJst);
    const title = read('title');
    const description = read('description');
    if (!title || !description || !Number.isFinite(start) || !Number.isFinite(end) || start <= Date.now() || end <= start) {
      setError('Enter a title and topic, and choose a future start with a later end time on the same date.');
      return;
    }

    update((previous) => {
      const sessions = previous.oneTimeSessions ?? [];
      return { ...previous, oneTimeSessions: [{
        id: nextId(sessions), courseId: Number(read('courseId')), title, description,
        startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), startsAtJst, endsAtJst,
        timeZone: APP_TIME_ZONE, locationType: read('locationType') as LocationType,
        locationDetails: read('locationDetails'), participantIds: [current.id],
      }, ...sessions] };
    });
    setEditing(false);
    setError('');
  }

  function join(id: number) {
    if (!current) return;
    update((previous) => ({
      ...previous,
      oneTimeSessions: (previous.oneTimeSessions ?? []).map((session) =>
        session.id === id && !session.participantIds.includes(current.id) && Date.parse(session.startsAt) > Date.now()
          ? { ...session, participantIds: [...session.participantIds, current.id] }
          : session),
    }));
  }

  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-xl font-bold">One-time study sessions</h2>
      {current && <Button variant={editing ? 'secondary' : 'primary'} onClick={() => { setEditing(!editing); setError(''); }}>{editing ? 'Cancel session form' : 'Create one-time session'}</Button>}
    </div>
    <p className="text-sm text-ink-500">Demo only. One-time sessions and participation are saved in this browser.</p>
    {editing && <Card><form className="space-y-4" onSubmit={create}>
      <Field label="Session course"><CourseSelect /></Field>
      <Field label="Session title"><input name="title" className={field} maxLength={200} required /></Field>
      <Field label="Description or topic"><textarea name="description" className={field} maxLength={2000} rows={3} required /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Date (JST)"><input type="date" name="date" min={todayJst()} className={field} required /></Field>
        <Field label="Start time (JST)"><input type="time" name="startTime" className={field} required /></Field>
        <Field label="End time (JST)"><input type="time" name="endTime" className={field} required /></Field>
      </div>
      <LocationField />
      <Field label="Meeting details or link"><input name="locationDetails" maxLength={300} className={field} /></Field>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <Button type="submit">Publish one-time session</Button>
    </form></Card>}
    {items.length ? items.map((session) => {
      const joined = current && session.participantIds.includes(current.id);
      const started = Date.parse(session.startsAt) <= Date.now();
      return <Card key={session.id} id={'one-time-' + session.id} className="scroll-mt-4 space-y-2">
        <div className="flex flex-wrap gap-2">
          <Badge tone="brand">{courses.find((course) => course.id === session.courseId)?.code ?? 'Course'}</Badge>
          <Badge>One-time · Browser-local</Badge>
          {joined && <Badge tone="brand">Joined session</Badge>}
        </div>
        <h3 className="break-words font-bold">{session.title}</h3>
        <p className="whitespace-pre-wrap break-words text-sm">{session.description}</p>
        <p className="text-sm">{timeLabel(session)}</p>
        <p className="break-words text-sm">{locationLabel(session)}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm"><strong>Participants ({session.participantIds.length})</strong>{session.participantIds.map((id) => <Person key={id} id={id} />)}</div>
        {current && !joined && !started && <Button variant="secondary" onClick={() => join(session.id)}>Join one-time session</Button>}
      </Card>;
    }) : <Empty>No one-time sessions match this course filter.</Empty>}
  </section>;
}
