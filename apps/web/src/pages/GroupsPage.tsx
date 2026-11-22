import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { StudyGroup } from '@tunion/shared';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Card from '../components/Card';
import Glyph from '../components/Glyph';
import { CourseSelect, Empty, Field, PageHeading, RequireAccount, field, textLink } from '../components/CommunityUI';
import { nextId, useCommunity } from '../demo/community';
import { useApiQuery } from '../lib/useApiQuery';
import { fetchStudyGroups } from './StudyGroupPage';
import OneTimeSessions from './OneTimeSessions';
import { useDemoAuth } from '../lib/demoAuth';

export function GroupList({ items, membership = false }: { items: StudyGroup[]; membership?: boolean }) {
  const { courses, update } = useCommunity();
  const { current } = useDemoAuth();

  function join(groupId: number) {
    if (!current) return;
    update((previous) => ({ ...previous, groups: previous.groups.map((group) => {
      if (group.id !== groupId || group.memberIds.includes(current.id) || group.memberIds.length >= group.maxMembers) return group;
      return { ...group, memberIds: [...group.memberIds, current.id] };
    }) }));
  }

  return items.length ? <div className="grid gap-3">{items.map((group) => {
    const joined = !!current && group.memberIds.includes(current.id);
    const full = group.memberIds.length >= group.maxMembers;
    return <Card key={group.id} className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-2">
        <Badge tone="brand">{courses.find((course) => course.id === group.courseId)?.code ?? 'Course'}</Badge>
        <h2 className="break-words font-bold">{group.name}</h2>
        <p className="break-words text-sm text-ink-700">{group.description}</p>
        <p className="flex items-center gap-2 text-sm text-ink-700"><Glyph name="calendar" className="size-4 shrink-0" />{group.meetingTime} · {group.location}</p>
        <p className="text-xs text-ink-500">{group.memberIds.length} / {group.maxMembers} members</p>
      </div>
      {membership && (joined ? <Badge tone="brand">Joined</Badge> : full ? <Badge>Full</Badge> : current ? <Button variant="secondary" onClick={() => join(group.id)}>Join group</Button> : <span className="text-xs text-ink-500">Select a demo account to join</span>)}
    </Card>;
  })}</div> : <Empty>No study groups found.</Empty>;
}

export default function GroupsPage() {
  const { current } = useDemoAuth();
  const { data, update } = useCommunity();
  const [course, setCourse] = useState('');
  const directory = useApiQuery(course === 'mine' ? '' : course, fetchStudyGroups);
  const enrollments = current ? data.enrollments[current.id] ?? [] : [];
  const matchesCourse = (item: { courseId: number }) => course === 'mine'
    ? enrollments.includes(item.courseId)
    : !course || String(item.courseId) === course;
  const groupsWithCalendars = (directory.data?.studyGroups ?? []).filter(matchesCourse);
  const [editing, setEditing] = useState(false);

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current) return;
    const form = new FormData(event.currentTarget);
    const read = (name: string) => String(form.get(name) ?? '').trim();
    update((previous) => ({ ...previous, groups: [{
      id: nextId(previous.groups), courseId: Number(read('courseId')), creatorId: current.id,
      name: read('name'), description: read('description'), meetingTime: read('meetingTime'), location: read('location'),
      maxMembers: Number(read('maxMembers')), memberIds: [current.id], createdAt: new Date().toISOString(),
    }, ...previous.groups] }));
    setCourse('');
    setEditing(false);
  }

  return <>
    <PageHeading title="Study Groups" description="Find classmates to study with or organize a session of your own.">
      <Button variant={editing ? 'secondary' : 'primary'} onClick={() => setEditing(!editing)}>{editing ? 'Cancel' : 'Create group'}</Button>
    </PageHeading>
    {editing && <RequireAccount><Card className="max-w-2xl"><form onSubmit={create} className="space-y-4">
      <Field label="Course"><CourseSelect defaultValue={course === 'mine' ? undefined : course} /></Field>
      <Field label="Group name"><input name="name" className={field} required pattern=".*\S.*" maxLength={120} /></Field>
      <Field label="Description"><textarea name="description" className={field} rows={3} /></Field>
      <Field label="Meeting time"><input name="meetingTime" className={field} required pattern=".*\S.*" placeholder="Wednesdays, 4 PM" /></Field>
      <Field label="Location"><input name="location" className={field} required pattern=".*\S.*" /></Field>
      <Field label="Member limit"><input name="maxMembers" className={field} type="number" min={2} max={100} defaultValue={8} required /></Field>
      <Button type="submit">Publish group</Button>
    </form></Card></RequireAccount>}
    <div className="max-w-md"><Field label="Course"><CourseSelect all includeMyCourses value={course} onChange={setCourse} /></Field></div>
    <OneTimeSessions items={(data.oneTimeSessions ?? []).filter(matchesCourse)} />
    <section className="space-y-3">
      <h2 className="text-xl font-bold">Groups with calendars</h2>
      {directory.loading || directory.error ? <Empty>{directory.error ?? 'Loading study groups…'}</Empty> : groupsWithCalendars.length
        ? <div className="grid gap-3 sm:grid-cols-2">{groupsWithCalendars.map((group) => <Card key={group.id} className="space-y-2">
          <h3 className="font-bold"><Link to={'/groups/' + group.id} className={textLink}>{group.name} →</Link></h3>
          <p className="text-sm text-ink-700">{group.description}</p>
          <p className="text-xs text-ink-500">{group.memberIds.length} / {group.maxMembers} members</p>
        </Card>)}</div> : <Empty>No groups with calendars match this course.</Empty>}
    </section>
    <section className="space-y-3">
      <h2 className="text-xl font-bold">Browser-local groups</h2>
      <GroupList items={data.groups.filter(matchesCourse)} membership />
    </section>
  </>;
}
