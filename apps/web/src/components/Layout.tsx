import { Link, NavLink, Outlet } from 'react-router-dom';
import monogram from '../assets/brand/tu-monogram-from-wordmark.svg';
import { useCommunity } from '../demo/community';
import { useDemoAuth } from '../lib/demoAuth';
import DemoAccountSwitcher from './DemoAccountSwitcher';

const navigation = [
  ['/', 'Dashboard'], ['/courses', 'Courses'], ['/discussions', 'Discussions'],
  ['/resources', 'Resources'], ['/tutoring', 'Tutoring'], ['/groups', 'Study Groups'],
] as const;

export default function Layout() {
  const { current } = useDemoAuth();
  const { storageError } = useCommunity();
  return <div className="min-h-screen">
    <header className="site-header">
      <Link to="/" className="site-mark" aria-label="TUnion home">
        <img src={monogram} alt="" width="48" height="25" />
      </Link>
      <nav aria-label="Main navigation" className="site-nav">
        {navigation.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}
        <NavLink to={current ? '/people/' + current.id : '/my-profile'}>My Profile</NavLink>
      </nav>
      <DemoAccountSwitcher />
    </header>
    <main className="mx-auto min-w-0 max-w-7xl space-y-8 px-5 pt-6 pb-14 sm:px-8 lg:px-10">
      {current && storageError && <p role="alert" className="rounded-lg bg-amber-950 p-3 text-sm text-amber-200">{storageError}</p>}
      <Outlet />
    </main>
    {current && <footer className="mx-auto max-w-7xl px-5 pb-6 text-xs text-ink-500 sm:px-8 lg:px-10">
      Local demo. Demo group creation and membership are saved in this browser.
    </footer>}
  </div>;
}
