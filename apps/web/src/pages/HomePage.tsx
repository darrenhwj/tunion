import { Link } from 'react-router-dom';
import type { Course } from '@tunion/shared';
import Card from '../components/Card';
import Badge from '../components/Badge';
import { Empty } from '../components/CommunityUI';
import DashboardCalendar from '../components/DashboardCalendar';
import Glyph from '../components/Glyph';
import { useCommunity } from '../demo/community';
import { useDemoAuth } from '../lib/demoAuth';
import collage from '../assets/campus-collage.jpg';

export default function HomePage() {
  const { current, loading } = useDemoAuth();
  if (loading) return <Empty>Loading dashboard…</Empty>;
  return current ? <StudentDashboard key={current.id} accountId={current.id} canTutor={current.role === 'tutor'} /> : <PublicLanding />;
}

function PublicLanding() {
  return <section className="overflow-hidden rounded-2xl bg-[#242058] text-white sm:grid lg:grid-cols-[0.85fr_1.15fr]">
    <div className="flex flex-col justify-center p-6 sm:p-10">
      <span className="mb-5 grid size-12 place-items-center rounded-xl bg-white/15"><Glyph name="brand" className="size-6" /></span>
      <h1 className="text-5xl font-extrabold tracking-tight sm:text-7xl">TUnion</h1>
      <p className="mt-4 max-w-md text-base leading-7 text-indigo-100">Your computer science peer-learning community. Find classmates, work through tough topics together, and get help from student tutors.</p>
    </div>
    <img src={collage} alt="A university courtyard and students learning together on campus" className="aspect-[3/2] h-full w-full object-cover" />
  </section>;
}

function StudentDashboard({ accountId, canTutor }: { accountId: number; canTutor: boolean }) {
  const { courses, loading, courseError, data } = useCommunity();
  const current = data.enrollments[accountId] ?? [];
  const previous = data.pastCourses?.[accountId] ?? [];
  const currentCourses = courses.filter((course) => current.includes(course.id));
  const pastCourses = courses.filter((course) => previous.includes(course.id) && !current.includes(course.id));

  return <>
    <DashboardCalendar accountId={accountId} canTutor={canTutor} />
    <section aria-labelledby="my-courses" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="my-courses" className="text-xl font-bold tracking-tight">My Courses</h2>
        <Link to="/courses" className="text-sm font-semibold text-brand-700 hover:underline">Browse courses →</Link>
      </div>
      {loading || courseError ? <Empty>{courseError || 'Loading courses…'}</Empty>
        : !currentCourses.length && !pastCourses.length ? <Empty>Join a course to see it here.</Empty>
        : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {currentCourses.map((course) => <CourseTile key={course.id} course={course} status="Current" />)}
          {pastCourses.map((course) => <CourseTile key={course.id} course={course} status="Past course" />)}
        </div>}
    </section>
  </>;
}

function CourseTile({ course, status }: { course: Course; status: string }) {
  return <Link to={'/courses/' + course.id} className="group min-w-0">
    <Card className="flex h-full min-w-0 items-start gap-3 p-4 group-hover:border-brand-500">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Glyph name="courses" className="size-4" /></span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-brand-700">{course.code}</span><Badge>{status}</Badge></div>
        <h3 className="mt-1 break-words text-sm font-semibold">{course.title}</h3>
      </div>
    </Card>
  </Link>;
}
