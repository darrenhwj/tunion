import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Tutor } from '@tunion/shared';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Card from '../components/Card';
import { CourseSelect, Empty, Field, PageHeading, RequireAccount, field, textLink } from '../components/CommunityUI';
import { nextId, useCommunity } from '../demo/community';
import { tutors } from '../demo/data';
import { useDemoAuth } from '../lib/demoAuth';

export function TutoringPage() {
  const { current, accounts } = useDemoAuth();
  const { data } = useCommunity();
  const [course, setCourse] = useState('');
  const available = tutors.filter((tutor) => !course || tutor.courseIds.includes(Number(course)));
  const requests = data.requests.filter((request) => current && (request.studentId === current.id || tutors.some((tutor) => tutor.id === request.tutorId && tutor.userId === current.id)));

  return <>
    <PageHeading title="Tutoring" description="Find a peer tutor by course and ask for help with a specific topic." />
    <div className="max-w-md"><Field label="Course"><CourseSelect all value={course} onChange={setCourse} /></Field></div>
    {available.length ? <div className="grid gap-4 sm:grid-cols-2">{available.map((tutor) => {
      const user = accounts.find((account) => account.id === tutor.userId);
      return <Card key={tutor.id} className="space-y-3">
        <h2 className="text-lg font-bold">{user?.name ?? 'Peer tutor'}</h2>
        <p className="text-sm text-ink-700">{tutor.headline}</p>
        <p className="text-sm text-ink-500">{tutor.availability}</p>
        <TutorCourses tutor={tutor} />
        <Link to={'/tutoring/' + tutor.id} className={textLink}>View tutor profile →</Link>
      </Card>;
    })}</div> : <Empty>No tutors match this course.</Empty>}
    {current && <section className="space-y-3">
      <h2 className="text-xl font-bold">My help requests</h2>
      {requests.length ? requests.map((request) => <Card key={request.id} className="space-y-2"><Badge>{request.status}</Badge><h3 className="font-semibold">{request.topic}</h3><p className="whitespace-pre-wrap break-words text-sm text-ink-700">{request.details}</p><p className="text-xs text-ink-500">{request.studentId === current.id ? 'Requested from ' + (accounts.find((account) => account.id === tutors.find((tutor) => tutor.id === request.tutorId)?.userId)?.name ?? 'peer tutor') : 'Requested by ' + (accounts.find((account) => account.id === request.studentId)?.name ?? 'student')}</p></Card>) : <Empty>No help requests yet.</Empty>}
    </section>}
  </>;
}

function TutorCourses({ tutor }: { tutor: Tutor }) {
  const { courses } = useCommunity();
  return <div className="flex flex-wrap gap-2">{courses.filter((course) => tutor.courseIds.includes(course.id)).map((course) => <Link to={'/courses/' + course.id} key={course.id} aria-label={course.title}><Badge tone="brand">{course.code}</Badge></Link>)}</div>;
}

export function TutorPage() {
  const { tutorId } = useParams();
  const { accounts, current } = useDemoAuth();
  const { courses, update } = useCommunity();
  const [submitted, setSubmitted] = useState(false);
  const tutor = tutors.find((entry) => String(entry.id) === tutorId);
  if (!tutor) return <Empty>Tutor not found.</Empty>;
  const user = accounts.find((account) => account.id === tutor.userId);

  function submit(event: FormEvent<HTMLFormElement>, selectedTutor: Tutor) {
    event.preventDefault();
    if (!current) return;
    const form = new FormData(event.currentTarget);
    const topic = String(form.get('topic')).trim();
    const details = String(form.get('details')).trim();
    if (!topic || !details) return;
    update((previous) => ({ ...previous, requests: [{
      id: nextId(previous.requests), courseId: Number(form.get('courseId')), studentId: current.id, tutorId: selectedTutor.id,
      topic, details, status: 'open', createdAt: new Date().toISOString(),
    }, ...previous.requests] }));
    event.currentTarget.reset();
    setSubmitted(true);
  }

  return <>
    <Link to="/tutoring" className={textLink}>← Tutor directory</Link>
    <PageHeading title={user?.name ?? 'Peer tutor'} description={tutor.headline} />
    <Card className="space-y-3">
      <p className="text-ink-700">{user?.bio}</p>
      <p className="text-sm"><strong>Availability</strong> · {tutor.availability}</p>
      <TutorCourses tutor={tutor} />
      {user && <Link className={textLink} to={'/people/' + user.id}>View community profile</Link>}
    </Card>
    <section className="space-y-3"><h2 className="text-xl font-bold">Request help</h2>
      <RequireAccount><Card className="max-w-2xl"><form onSubmit={(event) => submit(event, tutor)} className="space-y-4">
        <Field label="Course"><select name="courseId" className={field} required><option value="">Choose a course</option>{courses.filter((course) => tutor.courseIds.includes(course.id)).map((course) => <option value={course.id} key={course.id}>{course.code} · {course.title}</option>)}</select></Field>
        <Field label="Topic"><input name="topic" className={field} required pattern=".*\S.*" maxLength={140} /></Field>
        <Field label="What are you working on?"><textarea name="details" className={field} required rows={4} onChange={(event) => event.target.setCustomValidity(event.target.value.trim() ? '' : 'Describe what you are working on.')} /></Field>
        <Button type="submit">Send help request</Button>
        {submitted && <p role="status" className="text-sm text-brand-700">Help request saved. <Link className={textLink} to="/tutoring">View my requests</Link></p>}
      </form></Card></RequireAccount>
    </section>
  </>;
}
