import { useEffect, useRef, type ReactNode } from 'react';
import Button from './Button';

/** Modal confirmation, same <dialog> pattern as the demo account selector. Escape or Cancel closes it. */
export default function ConfirmDialog({ open, title, confirmLabel, busy = false, error = '', onConfirm, onCancel, children }: {
  open: boolean; title: string; confirmLabel: string; busy?: boolean; error?: string;
  onConfirm: () => void; onCancel: () => void; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (open && !element?.open) element?.showModal();
    if (!open && element?.open) element.close();
  }, [open]);
  return <dialog ref={dialog} aria-labelledby="confirm-title" onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}
    className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border border-line bg-surface p-5 text-ink-900 shadow-xl backdrop:bg-black/75">
    <h2 id="confirm-title" className="mb-3 text-lg font-bold">{title}</h2>
    <div className="space-y-2 text-sm text-ink-700">{children}</div>
    {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    <div className="mt-5 flex flex-wrap justify-end gap-2">
      <Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button>
      <Button disabled={busy} onClick={onConfirm}>{busy ? 'Working…' : confirmLabel}</Button>
    </div>
  </dialog>;
}
