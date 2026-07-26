import type { ReactNode } from 'react';

type Tone = 'neutral' | 'teal' | 'amber' | 'coral' | 'steel';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-surface text-text-muted',
  steel: 'bg-steel-50 text-steel-600 dark:bg-surface dark:text-steel-300',
  teal: 'bg-teal-100 text-teal-600 dark:bg-surface dark:text-teal-500',
  amber: 'bg-amber-100 text-amber-600 dark:bg-surface dark:text-amber-500',
  coral: 'bg-coral-100 text-coral-600 dark:bg-surface dark:text-coral-500',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ' + TONE_CLASSES[tone]}>
      {children}
    </span>
  );
}
