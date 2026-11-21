import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Empty, textLink } from '../components/CommunityUI';
import Glyph from '../components/Glyph';
import { useCommunity } from '../demo/community';
import { useDemoAuth } from '../lib/demoAuth';
import { CourseCard } from './CoursesPage';
import { DiscussionList } from './DiscussionsPage';
import { GroupList } from './GroupsPage';
import { ResourceList } from './ResourcesPage';

function DashboardSection({ title, to, action, children }: { title: string; to: string; action: string; children: ReactNode }) {
  return <section className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <Link to={to} className={textLink}>{action} →</Link>
    </div>
    {children}
  </section>;
}

export default function HomePage() {
  const { current } = useDemoAuth();
  const { courses, loading, courseError, data } = useCommunity();
  const myCourses = current ? courses.filter((course) => (data.enrollments[current.id] ?? []).includes(course.id)) : [];
  const joinedGroups = current ? data.groups.filter((group) => group.memberIds.includes(current.id)) : [];
  return <>
    <section className="relative isolate overflow-hidden rounded-2xl bg-[#242058] px-6 py-8 text-white sm:px-9 sm:py-10">
      <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-28 -z-10 size-80 rounded-full border-[36px] border-white/10" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 right-24 -z-10 size-64 rounded-full border-[30px] border-indigo-300/15" />
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">{current ? 'Welcome, ' + current.name.split(' ')[0] : 'Welcome to TUnion'}</h1>
      <p className="mt-3 max-w-lg text-sm leading-6 text-indigo-100 sm:text-base">Ask classmates for help, share resources, and find people to study with.</p>
      <Link to="/courses" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-brand-700 hover:bg-brand-100">Explore courses <Glyph name="arrow" className="size-4" /></Link>
    </section>
    <DashboardSection title="My Courses" to="/courses" action="Browse courses">
      {myCourses.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{myCourses.map((course) => <CourseCard key={course.id} course={course} />)}</div> : <Empty>{loading ? 'Loading courses…' : courseError || (current ? 'Join a course to see it here.' : 'Select a demo account in the header to see your courses.')}</Empty>}
    </DashboardSection>
    <div className="grid items-start gap-7 xl:grid-cols-[1.2fr_1fr]">
      <DashboardSection title="Recent discussions" to="/discussions" action="All discussions"><DiscussionList items={data.discussions.slice(0, 3)} /></DashboardSection>
      <DashboardSection title="Study sessions" to="/groups" action="Browse groups"><GroupList items={(joinedGroups.length ? joinedGroups : data.groups).slice(0, 2)} /></DashboardSection>
    </div>
    <DashboardSection title="Recent resources" to="/resources" action="All resources"><ResourceList items={data.resources.slice(0, 3)} /></DashboardSection>
  </>;
}
