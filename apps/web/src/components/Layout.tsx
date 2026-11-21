import { Link, Outlet } from 'react-router-dom';
import DemoAccountSwitcher from './DemoAccountSwitcher';

export default function Layout() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="text-xl font-bold text-brand-700">TUnion</Link>
          <DemoAccountSwitcher />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10">
        <Outlet />
      </main>
    </div>
  );
}
