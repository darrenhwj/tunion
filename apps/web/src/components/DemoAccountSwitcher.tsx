import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AccountBadges from './AccountBadges';
import Badge from './Badge';
import Button from './Button';
import { useDemoAuth } from '../lib/demoAuth';

export default function DemoAccountSwitcher() {
  const { accounts, current, loading, error, switchTo, selectorOpen, openSelector, closeSelector } = useDemoAuth();
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (selectorOpen && !element?.open) element?.showModal();
    if (!selectorOpen && element?.open) element.close();
  }, [selectorOpen]);

  function selectAccount(id: number | null) {
    switchTo(id);
    closeSelector();
    void navigate('/', { replace: id === null });
  }

  return <>
    <div className="site-account">
      <Badge tone="warning">Demo auth - not secure</Badge>
      <Button onClick={openSelector}>{current ? 'Switch demo account' : 'Sign In'}</Button>
    </div>
    <dialog ref={dialog} aria-labelledby="demo-selector-title" onCancel={closeSelector}
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border border-line bg-surface p-5 text-ink-900 shadow-xl backdrop:bg-black/75">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="demo-selector-title" className="text-lg font-bold">Choose a demo account</h2>
        <Button variant="ghost" onClick={closeSelector}>Close</Button>
      </div>
      <p className="mb-4 text-sm text-ink-500">Demo sign-in is insecure. Anyone can select any account.</p>
      {loading && <p role="status">Loading accounts…</p>}
      {error && <p role="alert">{error}</p>}
      <div className="grid gap-2">{accounts.map((account) => {
        const selected = account.id === current?.id;
        return <Button key={account.id} variant="secondary" aria-current={selected ? 'true' : undefined}
          className="flex-wrap justify-between gap-2 text-left aria-[current=true]:border-brand-500 aria-[current=true]:bg-brand-100"
          onClick={() => selectAccount(account.id)}>
          <span>{account.name}</span>
          <span className="flex flex-wrap items-center gap-2">
            <AccountBadges role={account.role} tutor={account.isTutor} />
            {selected && <Badge tone="brand">Current</Badge>}
          </span>
        </Button>;
      })}</div>
      {current && <Button variant="ghost" className="mt-3" onClick={() => selectAccount(null)}>Sign Out</Button>}
    </dialog>
  </>;
}
