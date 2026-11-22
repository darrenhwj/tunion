import { Navigate, Outlet } from 'react-router-dom';
import { useDemoAuth } from '../lib/demoAuth';
import Button from './Button';
import Card from './Card';
import { Empty } from './CommunityUI';

export default function ProtectedRoute() {
  const { current, loading, openSelector } = useDemoAuth();
  if (loading) return <Empty>Loading demo account…</Empty>;
  if (current) return <Outlet />;
  return <Card className="mx-auto max-w-md space-y-4 text-center">
    <h1 className="text-2xl font-bold">Sign in to view</h1>
    <Button onClick={openSelector}>Sign In</Button>
  </Card>;
}

export function MyProfileRoute() {
  const { current } = useDemoAuth();
  return current ? <Navigate replace to={'/people/' + current.id} /> : null;
}
