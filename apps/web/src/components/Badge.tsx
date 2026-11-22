import type { ReactNode } from 'react';

type Tone = 'brand' | 'neutral' | 'warning';
const tones: Record<Tone, string> = {
  brand: 'bg-brand-100 text-brand-700',
  neutral: 'bg-black/30 text-ink-900',
  warning: 'bg-amber-950 text-amber-200',
};

export default function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-block rounded-sm px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}
