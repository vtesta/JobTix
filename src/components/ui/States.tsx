import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export function EmptyState({ icon, title, description }: { icon?: ReactNode; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-600 bg-ink-900/50 px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-ink-800 text-ink-400">
        {icon ?? <Inbox size={22} />}
      </div>
      <p className="text-sm font-semibold text-ink-200">{title}</p>
      {description && <p className="mt-1 max-w-xs text-xs text-ink-400">{description}</p>}
    </div>
  );
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-20 w-full" />
      ))}
    </div>
  );
}

export function SkeletonDispatchDay({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card space-y-2.5 p-4">
          <div className="flex items-center gap-2">
            <div className="skeleton h-4 w-16" />
            <div className="skeleton h-4 w-40" />
          </div>
          <div className="skeleton h-3 w-full max-w-[240px]" />
          <div className="skeleton h-3 w-full max-w-[180px]" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-error-500/30 bg-error-500/10 px-5 py-6 text-center">
      <p className="text-sm font-semibold text-error-400">Something went wrong</p>
      <p className="mt-1 text-xs text-ink-300">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 text-xs font-semibold text-green-400 hover:text-green-300">
          Try again
        </button>
      )}
    </div>
  );
}

export function PageState({ loading, error, empty, children, onRetry }: {
  loading: ReactNode;
  error: string | null;
  empty: boolean;
  children: ReactNode;
  onRetry?: () => void;
}) {
  if (loading) return <>{loading}</>;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (empty) return <EmptyState title="Nothing here" />;
  return <>{children}</>;
}
