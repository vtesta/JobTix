import { TRIAL_DAYS } from '@/config/app';

export function trialDaysLeft(organization: { created_at: string; subscription_status: string } | null): number | null {
  if (!organization || organization.subscription_status !== 'trialing') return null;
  const created = new Date(organization.created_at).getTime();
  const elapsed = (Date.now() - created) / 86_400_000;
  return Math.max(0, Math.ceil(TRIAL_DAYS - elapsed));
}
