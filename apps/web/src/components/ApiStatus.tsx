import { useEffect, useState } from 'react';
import type { HealthResponse } from '@tunion/shared';
import { api } from '../lib/api';
import Badge from './Badge';

export default function ApiStatus() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api<HealthResponse>('/health').then(setHealth).catch(() => setFailed(true));
  }, []);
  if (failed) return <Badge tone="warning">API unreachable</Badge>;
  if (!health) return <Badge>Checking API...</Badge>;
  return (
    <Badge tone="brand">
      API {health.status} - DB {health.database}
      {health.counts ? ` (${health.counts.users} users, ${health.counts.courses} courses)` : ''}
    </Badge>
  );
}
