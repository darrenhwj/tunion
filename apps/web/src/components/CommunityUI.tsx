import AccountBadges from './AccountBadges';
import { cloneElement, useId, type ReactElement, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useCommunity } from '../demo/community';
import { useDemoAuth } from '../lib/demoAuth';
import Card from './Card';

export const field = 'w-full rounded-md border border-line bg-white/10 px-3 py-2.5 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/60';
export const action = 'facet-button inline-flex items-center gap-3 bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-800';
export const textLink = 'text-sm font-semibold text-brand-700 hover:underline';

export function PageHeading({ label, title, description, children }: { label?: string; title: string; description?: string; children?: ReactNode }) {
  return <header className="flex flex-wrap items-end justify-between gap-4">
    <div>
      {label && <p className="mb-2 text-xs font-bold uppercase tracking-widest text-brand-700">{label}</p>}
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-500">{description}</p>}
    </div>
    {children}
  </header>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <Card><p className="text-sm text-ink-500">{children}</p></Card>;
}

export function RequireAccount({ children }: { children: ReactNode }) {
  const { current } = useDemoAuth();
  return current ? children : <Empty>Select a demo account in the header to continue.</Empty>;
}

export function Field({ label, children }: { label: string; children: ReactElement<{ 'aria-labelledby'?: string }> }) {
  const id = useId();
  return <label className="grid gap-1.5 text-sm font-medium text-ink-700">
    <span id={id}>{label}</span>{cloneElement(children, { 'aria-labelledby': id })}
  </label>;
}

export function CourseSelect({ name = 'courseId', defaultValue, all = false, includeMyCourses = false, value, onChange, 'aria-labelledby': labelId }: { name?: string; defaultValue?: number | string; all?: boolean; includeMyCourses?: boolean; value?: string; onChange?: (value: string) => void; 'aria-labelledby'?: string }) {
  const { courses, loading } = useCommunity();
  return <select aria-labelledby={labelId} key={loading ? 'loading' : 'ready'} className={field} name={name} value={value} defaultValue={defaultValue} onChange={onChange && ((event) => onChange(event.target.value))} required={!all}>
    <option value="">{all ? 'All courses' : 'Choose a course'}</option>
    {all && includeMyCourses && <option value="mine">My Courses</option>}
    {courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}
  </select>;
}

export function Person({ id, showRole = false }: { id: number; showRole?: boolean }) {
  const { accounts } = useDemoAuth();
  const person = accounts.find((account) => account.id === id);
  if (!person) return 'Community member';
  return <span className="inline-flex flex-wrap items-center gap-2">
    <Link className="font-medium hover:text-brand-700 hover:underline" to={'/people/' + id}>{person.name}</Link>
    {showRole && <AccountBadges role={person.role} tutor={person.isTutor} />}
  </span>;
}

export function Tabs({ links, label }: { links: { to: string; label: string }[]; label: string }) {
  return <nav aria-label={label} className="flex gap-5 overflow-x-auto border-b border-line">
    {links.map((link) => <NavLink key={link.to} end to={link.to} className={({ isActive }) => 'whitespace-nowrap border-b-2 px-1 py-3 text-sm font-semibold ' + (isActive ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-900')}>{link.label}</NavLink>)}
  </nav>;
}

export function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}
