import type { ReactNode } from 'react';

type Tone = 'neutral' | 'green' | 'warning' | 'error' | 'info';

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

const tones: Record<Tone, string> = {
  neutral: 'bg-ink-700/60 text-ink-300 ring-ink-600',
  green: 'bg-green-500/15 text-green-400 ring-green-500/30',
  warning: 'bg-warning-500/15 text-warning-400 ring-warning-500/30',
  error: 'bg-error-500/15 text-error-400 ring-error-500/30',
  info: 'bg-info-500/15 text-info-400 ring-info-500/30',
};

export function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold ring-1 ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
