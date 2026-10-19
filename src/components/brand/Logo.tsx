import { APP_NAME } from '@/config/app';

/* The TradeDesk mark: a job ticket with a checkmark, drawn as a vector
   so it stays sharp from the browser tab icon up to the landing header. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={`${APP_NAME} logo`}
    >
      <rect width="100" height="100" rx="22" fill="#16a34a" />
      <path
        d="M22 44 h56"
        stroke="#d1fad9"
        strokeWidth="7"
        strokeLinecap="round"
        opacity="0.35"
      />
      <path
        d="M27 72 h46"
        stroke="#d1fad9"
        strokeWidth="7"
        strokeLinecap="round"
        opacity="0.35"
      />
      <path
        d="M31 24 v56"
        stroke="#d1fad9"
        strokeWidth="9"
        strokeLinecap="round"
        opacity="0.35"
      />
      <path
        d="M46 34 l9 9 16-16"
        fill="none"
        stroke="#ffffff"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  size = 'base',
  withName = true,
}: {
  size?: 'sm' | 'base' | 'lg';
  withName?: boolean;
}) {
  const dims = { sm: 28, base: 32, lg: 36 } as const;
  const label = { sm: 'text-sm', base: 'text-base', lg: 'text-lg' } as const;

  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={dims[size]} />
      {withName && (
        <span className={`font-display ${label[size]} font-bold text-ink-50`}>{APP_NAME}</span>
      )}
    </span>
  );
}
