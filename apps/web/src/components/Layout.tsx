import { Link, NavLink, Outlet } from 'react-router-dom';
import { useCommunity } from '../demo/community';
import { useDemoAuth } from '../lib/demoAuth';
import DemoAccountSwitcher from './DemoAccountSwitcher';
import Glyph from './Glyph';

const navigation = [
  ['home', '/', 'Dashboard'], ['courses', '/courses', 'Courses'], ['discussions', '/discussions', 'Discussions'],
  ['resources', '/resources', 'Resources'], ['tutoring', '/tutoring', 'Tutoring'], ['groups', '/groups', 'Study Groups'],
] as const;

export default function Layout() {
  const { current } = useDemoAuth();
  const { storageError } = useCommunity();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[230px_minmax(0,1fr)]">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-r lg:border-b-0">
        <Link to="/" className="flex items-center gap-3 px-5 py-5 lg:px-6 lg:py-7">
          <span className="grid size-10 place-items-center rounded-xl bg-brand-600 text-white"><Glyph name="brand" /></span>
          <span><span className="block text-xl font-extrabold tracking-tight">TUnion</span><span className="block text-xs text-ink-500">CS Peer Learning</span></span>
        </Link>
        <nav aria-label="Main navigation" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-4">
          {navigation.map(([icon, to, label]) => <NavLink key={to} to={to} end={to === '/'} className={navClass}><Glyph name={icon} />{label}</NavLink>)}
          <NavLink to={current ? '/people/' + current.id : '/my-profile'} className={navClass}><Glyph name="profile" />My Profile</NavLink>
        </nav>
        {current && <p className="mt-auto hidden px-6 py-6 text-xs leading-relaxed text-ink-500 lg:block">Local demo. Demo group creation and membership are saved in this browser.</p>}
      </aside>
      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-8 lg:min-h-[74px]">
          <span className="text-sm font-medium text-ink-700">Computer Science Community</span>
          <DemoAccountSwitcher />
        </header>
        <main className="mx-auto max-w-7xl space-y-7 px-4 py-7 sm:px-8 sm:py-9">
          {current && <p className="text-xs text-ink-500 lg:hidden">Local demo. Demo group creation and membership are saved in this browser.</p>}
          {current && storageError && <p role="alert" className="rounded-lg bg-amber-100 p-3 text-sm text-amber-900">{storageError}</p>}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function navClass({ isActive }: { isActive: boolean }) {
  return 'flex shrink-0 items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-semibold ' + (isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-canvas');
}
