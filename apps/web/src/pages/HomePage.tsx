import { Link } from 'react-router-dom';
import { action, Empty } from '../components/CommunityUI';
import DashboardCalendar from '../components/DashboardCalendar';
import Glyph from '../components/Glyph';
import { useCommunity } from '../demo/community';
import { useDemoAuth } from '../lib/demoAuth';
import wordmark from '../assets/brand/tunion-wordmark-white.svg';
import blossoms from '../assets/photos/landing/temple-campus-blossoms.webp';
import classroom from '../assets/photos/landing/temple-classroom-study.webp';
import mascot from '../assets/photos/landing/temple-students-mascot.webp';
import { CourseCard } from './CoursesPage';

export default function HomePage() {
  const { current, loading } = useDemoAuth();
  if (loading) return <Empty>Loading dashboard…</Empty>;
  return current ? <StudentDashboard key={current.id} accountId={current.id} canTutor={current.isTutor} /> : <PublicLanding />;
}

function PublicLanding() {
  return <section className="landing" aria-labelledby="landing-heading">
    <div className="landing-copy">
      <img src={wordmark} alt="TUnion" className="w-full max-w-[26rem]" fetchPriority="high" />
      <p className="mt-4 text-xl font-bold text-ink-700 sm:text-2xl">CS Peer Learning</p>
      <h1 id="landing-heading" className="mt-8 text-3xl font-extrabold tracking-tight sm:mt-10 sm:text-4xl">Welcome to TUnion</h1>
      <p className="mt-3 max-w-sm text-base leading-7 text-ink-700">Ask classmates for help, share resources, and work through tough topics with peer tutors.</p>
      <Link to="/courses" className={action + ' mt-8'}>Explore courses <Glyph name="arrow" className="size-5" /></Link>
    </div>
    <div className="landing-photos">
      <img src={mascot} alt="Temple students posing with the university mascot" className="landing-mascot" />
      <img src={blossoms} alt="Cherry blossoms outside a Temple campus building" className="landing-campus" />
      <img src={classroom} alt="Students working together in class" className="landing-classroom" />
    </div>
  </section>;
}

function StudentDashboard({ accountId, canTutor }: { accountId: number; canTutor: boolean }) {
  const { courses, loading, courseError, myCourses, enrollmentsLoading, enrollmentsError } = useCommunity();
  const currentCourses = courses.filter((course) => myCourses.current.includes(course.id));
  const error = courseError || enrollmentsError;

  return <>
    <DashboardCalendar accountId={accountId} canTutor={canTutor} />
    <section aria-labelledby="my-courses" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="my-courses" className="text-xl font-bold tracking-tight uppercase">My Courses</h2>
        <Link to="/courses" className="inline-flex items-center gap-2 text-sm font-semibold hover:underline">Browse courses <Glyph name="arrow" className="size-5" /></Link>
      </div>
      {loading || enrollmentsLoading || error ? <Empty>{error || 'Loading courses…'}</Empty>
        : !currentCourses.length ? <Empty>You have no current courses.</Empty>
        : <div className="course-grid">
          {currentCourses.map((course) => <CourseCard key={course.id} course={course} dashboard />)}
        </div>}
    </section>
  </>;
}
