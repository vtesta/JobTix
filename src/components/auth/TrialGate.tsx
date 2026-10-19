import { useMemo } from 'react';
import { useAuth } from '@/hooks/AuthContext';
import { TRIAL_DAYS } from '@/config/app';
import { Button } from '@/components/ui/Button';
import { TimerReset } from 'lucide-react';

export function useTrialStatus(): { trialing: boolean; daysLeft: number; expired: boolean } {
  const { organization } = useAuth();
  return useMemo(() => {
    if (!organization || organization.subscription_status !== 'trialing') {
      return { trialing: false, daysLeft: 0, expired: false };
    }
    const created = new Date(organization.created_at).getTime();
    const elapsedDays = (Date.now() - created) / 86_400_000;
    const daysLeft = Math.max(0, Math.ceil(TRIAL_DAYS - elapsedDays));
    return { trialing: true, daysLeft, expired: daysLeft <= 0 };
  }, [organization]);
}

export function TrialPaywall({ onNavigate }: { onNavigate: (pageId: string) => void }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-5">
      <div className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-8 text-center shadow-pop animate-fade-up">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-warning-500/15 text-warning-400 ring-1 ring-warning-500/30">
          <TimerReset size={26} />
        </div>
        <h1 className="text-xl font-bold text-ink-50">Your free trial has ended</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-400">
          Pick a plan to keep your tickets, timeclock, and crew workspace running. Everything you've created is
          safe and waiting.
        </p>
        <Button size="lg" className="mt-6" fullWidth onClick={() => onNavigate('settings')}>
          View plans
        </Button>
      </div>
    </div>
  );
}
