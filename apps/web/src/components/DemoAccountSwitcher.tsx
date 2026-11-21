import Badge from './Badge';
import { useDemoAuth } from '../lib/demoAuth';

export default function DemoAccountSwitcher() {
  const { accounts, current, loading, error, switchTo } = useDemoAuth();
  return (
    <div className="flex items-center gap-2" title="Demo authentication only. Not secure; anyone can pick any account.">
      <Badge tone="warning">Demo auth - not secure</Badge>
      <select
        aria-label="Switch demo account"
        className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
        disabled={loading || !!error}
        value={current?.id ?? ''}
        onChange={(e) => switchTo(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">{error ? 'API unavailable' : 'Signed out'}</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.role})
          </option>
        ))}
      </select>
    </div>
  );
}
