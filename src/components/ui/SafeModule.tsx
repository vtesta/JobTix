import type { ReactNode } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/Button';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface SafeModuleProps {
  children: ReactNode;
  moduleName: string;
}

export function SafeModule({ children, moduleName }: SafeModuleProps) {
  return (
    <ErrorBoundary
      fallback={
        <div className="mx-auto max-w-md px-5 py-16 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-warning-500/15 text-warning-400">
            <AlertTriangle size={22} />
          </div>
          <h2 className="text-base font-bold text-ink-50">{moduleName} hit a snag</h2>
          <p className="mt-1.5 text-sm text-ink-400">
            This section could not load. Your other pages are unaffected.
          </p>
          <Button variant="secondary" icon={<RotateCcw size={14} />} className="mt-5" onClick={() => window.location.reload()}>
            Reload app
          </Button>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
