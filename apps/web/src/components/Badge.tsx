import type { ReactNode } from 'react';

type Tone = 'brand' | 'neutral' | 'warning';
const tones: Record<Tone, string> = {
  brand: 'bg-brand-100 text-brand-700',
  neutral: 'bg-slate-100 text-ink-700',
  warning: 'bg-amber-100 text-amber-800',
};

export default function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}
