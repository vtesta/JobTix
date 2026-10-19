import { useEffect, useState } from 'react';
import { Page, PageHeader } from '@/components/ui/Page';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/hooks/AuthContext';
import { updateOrganization } from '@/features/team/teamService';
import { useBilling } from '@/features/billing/billingService';
import { supabase } from '@/lib/supabase';
import { isEmail, sanitizeText } from '@/lib/format';
import { PLANS, planById } from '@/config/app';
import {
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CreditCard,
  ExternalLink,
  Mail,
} from 'lucide-react';

const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function SettingsPage() {
  const { organization, refreshOrganization, isAdmin, isOwner } = useAuth();
  const { startCheckout, openPortal, status, error: billingError } = useBilling();
  const [activeMembers, setActiveMembers] = useState(0);
  const [name, setName] = useState(organization?.name ?? '');
  const [email, setEmail] = useState(organization?.default_recipient_email ?? '');
  const [weekStart, setWeekStart] = useState(organization?.work_week_start ?? 5);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billingOpen, setBillingOpen] = useState<boolean | null>(null);

  useEffect(() => {
    if (!organization) return;
    let cancelled = false;
    void (async () => {
      const { count } = await supabase
        .from('team_members')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id)
        .eq('status', 'active');
      if (!cancelled) setActiveMembers(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [organization]);

  if (!organization) return null;

  const currentPlan = planById(organization.subscription_plan);
  const origin = window.location.origin;
  // Expanded by default until they subscribe; collapsed afterwards unless opened.
  const billingExpanded = billingOpen ?? organization.subscription_status !== 'active';

  const save = async () => {
    setError(null);
    const cleanName = sanitizeText(name, 80);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanName) {
      setError('Workspace name is required.');
      return;
    }
    if (cleanEmail && !isEmail(cleanEmail)) {
      setError('Enter a valid recipient email.');
      return;
    }
    setSaving(true);
    const ok = await updateOrganization(organization.id, {
      name: cleanName,
      default_recipient_email: cleanEmail,
      work_week_start: weekStart,
    });
    setSaving(false);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await refreshOrganization();
    } else {
      setError('Could not save changes.');
    }
  };

  return (
    <Page>
      <PageHeader
        title="Configuration"
        description="Workspace details, plan, and billing."
        actions={
          isOwner && organization.stripe_customer_id ? (
            <Button
              variant="secondary"
              icon={<ExternalLink size={15} />}
              loading={status === 'loading'}
              onClick={() => void openPortal(origin)}
            >
              Billing portal
            </Button>
          ) : undefined
        }
      />

      {(error || billingError) && (
        <div className="mb-4 rounded-lg border border-error-500/30 bg-error-500/10 px-4 py-3 text-xs text-error-400">
          {error ?? billingError}
        </div>
      )
      }

      {/* Plans & billing — front and center during the trial, collapsible once subscribed */}
      <div className="mb-4 max-w-xl animate-fade-up">
        <button
          type="button"
          onClick={() => setBillingOpen(!billingExpanded)}
          aria-expanded={billingExpanded}
          className="card flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition-colors hover:border-ink-500"
        >
          <CreditCard size={18} className="text-green-400" />
          <div>
            <p className="text-2xs uppercase tracking-wider text-ink-400">Plan &amp; billing</p>
            <p className="text-sm font-bold text-ink-50">
              {currentPlan?.name ?? 'Free'}
              <span className="ml-2 align-middle">
                <Badge
                  tone={
                    organization.subscription_status === 'active'
                      ? 'green'
                      : organization.subscription_status === 'trialing'
                        ? 'info'
                        : 'warning'
                  }
                >
                  {organization.subscription_status}
                </Badge>
              </span>
            </p>
          </div>
          <p className="ml-auto text-xs text-ink-400">
            <span className="font-semibold text-ink-200">{activeMembers}</span> of {organization.seat_limit} seats
            used
          </p>
          <ChevronDown
            size={16}
            className={`shrink-0 text-ink-400 transition-transform duration-200 ${billingExpanded ? 'rotate-180' : ''}`}
          />
        </button>

        {billingExpanded && (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {PLANS.map((plan) => {
              const isCurrent = plan.id === organization.subscription_plan;
              return (
                <div key={plan.id} className={`card flex flex-col p-5 ${isCurrent ? 'ring-2 ring-green-500/40' : ''}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-ink-50">{plan.name}</h3>
                    {isCurrent && <Badge tone="green">Current</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-ink-400">{plan.blurb}</p>
                  <p className="mt-3">
                    <span className="text-2xl font-bold text-ink-50">${plan.price}</span>
                    <span className="text-xs text-ink-400"> /mo</span>
                  </p>
                  <ul className="mt-4 flex-1 space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-ink-200">
                        <Check size={13} className="mt-0.5 shrink-0 text-green-400" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {isOwner ? (
                    <Button
                      className="mt-4"
                      variant={isCurrent ? 'secondary' : 'primary'}
                      disabled={isCurrent}
                      loading={status === 'loading'}
                      onClick={() => void startCheckout(plan.id, origin)}
                    >
                      {isCurrent ? 'Active plan' : 'Choose plan'}
                    </Button>
                  ) : (
                    <p className="mt-4 text-center text-2xs text-ink-500">
                      Only the workspace owner can change plans.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card max-w-xl p-5 animate-fade-up">
        <div className="space-y-4">
          <div>
            <label className="field-label" htmlFor="work-week-start">Work week starts on</label>
            <select
              id="work-week-start"
              className="field-input"
              value={weekStart}
              onChange={(e) => setWeekStart(Number(e.target.value))}
              disabled={!isAdmin}
            >
              {WEEK_DAYS.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
            <p className="mt-1 text-2xs text-ink-500">
              Controls the weekly range for ticket sending and timeclock hour totals.
            </p>
          </div>
          <Input
            label="Workspace name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            disabled={!isAdmin}
          />
          <Input
            label="Default recipient email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            hint="Job tickets are emailed here when you press Send."
            disabled={!isAdmin}
          />
          {error && <p className="text-xs text-error-400">{error}</p>}
          {isAdmin && (
            <div className="flex items-center gap-3">
              <Button onClick={save} loading={saving} icon={saved ? <Check size={15} /> : undefined}>
                {saved ? 'Saved' : 'Save changes'}
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="card mt-4 max-w-xl p-5 animate-fade-up">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-800 text-green-400">
            <Building2 size={17} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-100">Workspace</p>
            <p className="mt-0.5 text-xs text-ink-400">
              Your workspace was created {new Date(organization.created_at).toLocaleDateString()} and runs on the{' '}
              <span className="capitalize text-ink-200">{organization.subscription_plan}</span> plan.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-800 text-green-400">
            <CalendarDays size={17} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-100">Work week</p>
            <p className="mt-0.5 text-xs text-ink-400">
              Currently starts on {WEEK_DAYS[weekStart]}. Weekly ticket and timeclock totals reset on this day.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-800 text-green-400">
            <Mail size={17} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-100">Ticket delivery</p>
            <p className="mt-0.5 text-xs text-ink-400">
              Sending a ticket opens an email draft addressed to your default recipient with the job details pre-filled.
            </p>
          </div>
        </div>
      </div>
    </Page>
  );
}
