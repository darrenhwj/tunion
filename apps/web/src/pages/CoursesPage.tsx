import { useState } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import type { Course, GetCourseResponse, ListCourseMembersResponse, ListCoursesResponse } from '@tunion/shared';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Card from '../components/Card';
import Glyph from '../components/Glyph';
import { Empty, Field, PageHeading, Person, Tabs, field } from '../components/CommunityUI';
import { useCommunity } from '../demo/community';
import { api } from '../lib/api';
import { useApiQuery } from '../lib/useApiQuery';
import { useDemoAuth } from '../lib/demoAuth';

export function CourseCard({ course }: { course: Course }) {
  return <Link to={'/courses/' + course.id} className="group block h-full">
    <Card className="flex h-full flex-col gap-3 transition group-hover:border-brand-500">
      <div className="flex items-center justify-between gap-2">
        <span className="grid size-10 place-items-center rounded-lg bg-brand-50 text-brand-700"><Glyph name="courses" /></span>
        <Badge>{course.level} level</Badge>
      </div>
      <p className="text-xs font-bold tracking-wide text-brand-700">{course.code}</p>
      <h2 className="text-lg font-bold leading-tight">{course.title}</h2>
      <p className="flex-1 text-sm leading-6 text-ink-500">{course.description}</p>
      <span className="flex items-center gap-2 text-sm font-semibold text-brand-700">View course <Glyph name="arrow" className="size-4" /></span>
    </Card>
  </Link>;
}

function fetchCourses(query: string, signal: AbortSignal) {
  return api<ListCoursesResponse>('/courses?' + query, { signal });
}

function fetchCourse(id: string, signal: AbortSignal) {
  return api<GetCourseResponse>('/courses/' + encodeURIComponent(id), { signal });
}

export function CoursesPage() {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('');
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  if (level) params.set('level', level);
  const { data, loading, error } = useApiQuery(params.toString(), fetchCourses);
  const visible = data?.courses ?? [];

  return <>
    <PageHeading title="Course directory" description="Find a course to connect with classmates, ask questions, and share study materials." />
    <Card className="grid gap-4 sm:grid-cols-[1fr_180px]">
      <Field label="Search courses"><input type="search" maxLength={100} value={query} onChange={(event) => setQuery(event.target.value)} className={field} placeholder="Search by code or topic" /></Field>
      <Field label="Course level"><select className={field} value={level} onChange={(event) => setLevel(event.target.value)}>
        <option value="">All levels</option>{[100, 200, 300, 400].map((value) => <option key={value}>{value}</option>)}
      </select></Field>
    </Card>
    {loading || error || !visible.length
      ? <Empty>{loading ? 'Loading courses…' : error || 'No courses match your search.'}</Empty>
      : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map((course) => <CourseCard key={course.id} course={course} />)}</div>}
  </>;
}

export function CoursePage() {
  const { courseId = '' } = useParams();
  const { myCourses, setEnrollment } = useCommunity();
  const { current } = useDemoAuth();
  const [actionError, setActionError] = useState('');
  const query = useApiQuery(courseId, fetchCourse);
  const course = query.data?.course;
  if (!course) return <Empty>{query.error ?? 'Loading course…'}</Empty>;
  const base = '/courses/' + course.id;
  const enrolled = !!current && myCourses.current.includes(course.id);
  return <>
    <Link to="/courses" className="text-sm font-semibold text-brand-700 hover:underline">← Course directory</Link>
    <PageHeading label={course.code} title={course.title} description={course.description}>
      {current && <Button variant={enrolled ? 'secondary' : 'primary'} onClick={() => setEnrollment(course.id, enrolled ? 'completed' : 'current').then(() => setActionError(''), (e: Error) => setActionError(e.message))}>{enrolled ? 'Leave course' : 'Join course'}</Button>}
    </PageHeading>
    {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}
    <Tabs label="Course sections" links={[{ to: base, label: 'Discussions' }, { to: base + '/resources', label: 'Resources' }, { to: base + '/people', label: 'People' }]} />
    <Outlet context={course} />
  </>;
}

function fetchMembers(id: string, signal: AbortSignal) {
  return api<ListCourseMembersResponse>('/courses/' + encodeURIComponent(id) + '/members', { signal });
}

export function CoursePeople() {
  const { courseId = '' } = useParams();
  const { data, loading, error } = useApiQuery(courseId, fetchMembers);
  if (loading || error) return <Empty>{error ?? 'Loading members…'}</Empty>;
  const people = data?.members ?? [];
  return people.length ? <div className="grid gap-3 sm:grid-cols-2">{people.map((person) => <Card key={person.id}><Person id={person.id} showRole /></Card>)}</div> : <Empty>No members have joined this course yet.</Empty>;
}
