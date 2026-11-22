import type { UserRole } from '@tunion/shared';
import Badge from './Badge';

export default function AccountBadges({ role, tutor = role === 'tutor' }: { role: UserRole; tutor?: boolean }) {
  return <span className="inline-flex flex-wrap items-center gap-1">
    <Badge>{role === 'admin' ? 'Admin' : 'Student'}</Badge>
    {tutor && <Badge tone="brand">Tutor</Badge>}
  </span>;
}
