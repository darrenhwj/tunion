import AccountBadges from '../components/AccountBadges';
import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { LOCATION_TYPE_LABELS, type CreateTutoringRequestRequest, type CreateTutoringRequestResponse, type GetTutorResponse, type ListTutorsResponse, type TutorProfile } from '@tunion/shared';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Card from '../components/Card';
import { CourseSelect, Empty, Field, PageHeading, RequireAccount, field, textLink } from '../components/CommunityUI';
import { useCommunity } from '../demo/community';
import { api, postJson } from '../lib/api';
import { useDemoAuth } from '../lib/demoAuth';
import { weekdays } from '../lib/schedule';
import { errorMessage, useApiQuery } from '../lib/useApiQuery';
import { TutoringActivity } from './TutoringActivity';

function fetchTutors(course: string, signal: AbortSignal) {
  const query = course ? '?' + new URLSearchParams({ courseId: course }) : '';
  return api<ListTutorsResponse>('/tutors' + query, { signal });
}

function fetchTutor(id: string, signal: AbortSignal) {
  return api<GetTutorResponse>('/tutors/' + encodeURIComponent(id), { signal });
}

export function TutoringPage() {
  const { current } = useDemoAuth();
  const [course, setCourse] = useState('');
  const query = useApiQuery(course, fetchTutors);
  const available = query.data?.tutors ?? [];

  return <>
    <PageHeading title="Tutoring" description="Find a peer tutor by course, check their weekly hours, and request a session.">
      {current?.role === 'tutor' && <Link to="/tutoring/availability" className={textLink}>Manage my availability →</Link>}
    </PageHeading>
    <div className="max-w-md"><Field label="Course"><CourseSelect all value={course} onChange={setCourse} /></Field></div>
    {query.loading || query.error ? <Empty>{query.error ?? 'Loading tutors…'}</Empty> : available.length
      ? <div className="grid gap-4 sm:grid-cols-2">{available.map((tutor) => <Card key={tutor.id} className="space-y-3">
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold">{tutor.user.name}</h2><AccountBadges role={tutor.user.role} tutor /></div>
        <p className="text-sm text-ink-700">{tutor.headline}</p>
        <p className="text-sm text-ink-500">{tutor.slots.length ? tutor.slots.length + ' weekly slots (JST)' : 'No weekly slots listed'}</p>
        <TutorCourses tutor={tutor} />
        <Link to={'/tutoring/' + tutor.id + (course ? '?course=' + course : '')} className={textLink}>View tutor profile →</Link>
      </Card>)}</div>
      : <Empty>No tutors match this course.</Empty>}
    {current && <TutoringActivity key={current.id} userId={current.id} />}
  </>;
}

function TutorCourses({ tutor }: { tutor: TutorProfile }) {
  const { courses } = useCommunity();
  return <div className="flex flex-wrap gap-2">{courses.filter((course) => tutor.courseIds.includes(course.id)).map((course) => <Link to={'/courses/' + course.id} key={course.id} aria-label={course.title}><Badge tone="brand">{course.code}</Badge></Link>)}</div>;
}

function slotLabel(slot: TutorProfile['slots'][number]) {
  return weekdays[slot.dayOfWeek] + ' · ' + slot.startTime + '–' + slot.endTime + ' JST · ' + LOCATION_TYPE_LABELS[slot.locationType];
}

export function TutorPage() {
  const { tutorId = '' } = useParams();
  const { accounts, current } = useDemoAuth();
  const query = useApiQuery(tutorId, fetchTutor);
  const tutor = query.data?.tutor;
  if (!tutor) return <Empty>{query.error ?? 'Loading tutor…'}</Empty>;
  const user = accounts.find((account) => account.id === tutor.userId);
  const ownProfile = current?.id === tutor.userId;
  return <>
    <Link to="/tutoring" className={textLink}>← Tutor directory</Link>
    <PageHeading title={tutor.user.name} description={tutor.headline}>
      <AccountBadges role={tutor.user.role} tutor />
      {ownProfile && <Link to="/tutoring/availability" className={textLink}>Manage my availability →</Link>}
    </PageHeading>
    <Card className="space-y-3">
      {user?.bio && <p className="text-ink-700">{user.bio}</p>}
      <TutorCourses tutor={tutor} />
      <Link className={textLink} to={'/people/' + tutor.userId}>View community profile</Link>
    </Card>
    <Card className="space-y-3">
      <h2 className="text-xl font-bold">Weekly availability</h2>
      {tutor.slots.length ? <ul className="divide-y divide-line">{tutor.slots.map((slot) => <li key={slot.id} className="py-2 text-sm">{slotLabel(slot)}</li>)}</ul> : <p className="text-sm text-ink-500">No weekly slots listed.</p>}
    </Card>
    {!ownProfile && <section className="space-y-3"><h2 className="text-xl font-bold">Request help</h2>
      <RequireAccount><RequestForm key={tutor.id + ':' + current?.id} tutor={tutor} /></RequireAccount>
    </section>}
  </>;
}

function RequestForm({ tutor }: { tutor: TutorProfile }) {
  const { courses } = useCommunity();
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [params] = useSearchParams();
  const preferredCourse = params.get('course') ?? '';
  const preselected = tutor.courseIds.includes(Number(preferredCourse)) ? preferredCourse : '';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const request: CreateTutoringRequestRequest = {
      courseId: Number(form.get('courseId')),
      tutorId: tutor.id,
      topic: String(form.get('topic')).trim(),
      details: String(form.get('details')).trim(),
      slotId: Number(form.get('slotId')) || null,
    };
    setPending(true);
    setSubmitted(false);
    setError('');
    try {
      await postJson<CreateTutoringRequestResponse>('/tutoring-requests', request);
      element.reset();
      setSubmitted(true);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return <Card className="max-w-2xl"><form onSubmit={submit}><fieldset className="min-w-0 space-y-4" disabled={pending}>
    <Field label="Course"><select key={courses.length} name="courseId" className={field} defaultValue={preselected} required>
      <option value="">Choose a course</option>{courses.filter((course) => tutor.courseIds.includes(course.id)).map((course) => <option value={course.id} key={course.id}>{course.code} · {course.title}</option>)}
    </select></Field>
    {tutor.slots.length > 0 && <Field label="Preferred weekly slot"><select name="slotId" className={field}><option value="">No preference</option>{tutor.slots.map((slot) => <option key={slot.id} value={slot.id}>{slotLabel(slot)}</option>)}</select></Field>}
    <Field label="Topic"><input name="topic" className={field} required minLength={3} maxLength={200} /></Field>
    <Field label="What are you working on?"><textarea name="details" className={field} maxLength={5000} rows={4} /></Field>
    <Button type="submit">{pending ? 'Sending…' : 'Send help request'}</Button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {submitted && <p role="status" className="text-sm text-brand-700">Help request sent. <Link className={textLink} to="/tutoring#requests">View my requests</Link></p>}
  </fieldset></form></Card>;
}
