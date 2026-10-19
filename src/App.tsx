import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { AuthProvider, useAuth } from '@/hooks/AuthContext';
import { LandingPage } from '@/features/landing/LandingPage';
import { AppShell } from '@/components/layout/AppShell';
import { SafeModule } from '@/components/ui/SafeModule';
import { ToastProvider } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { OwnerAuth } from '@/components/auth/owner/OwnerAuth';
import { BusinessDetailsForm } from '@/components/auth/owner/BusinessDetailsForm';
import { CompleteAccount } from '@/components/auth/CompleteAccount';
import { TrialPaywall } from '@/components/auth/TrialGate';
import { SkeletonList } from '@/components/ui/States';
import { useJobNames, useEmployees } from '@/features/shared/workspaceService';
import { fetchInvoices, buildBillingIndex } from '@/features/jobs/invoicesService';
import { PAGE_REGISTRY } from '@/components/layout/AppShell';
import { trialDaysLeft as computeTrialDaysLeft } from '@/components/auth/trial';
import type { Invoice } from '@/config/types';
import { Clock } from 'lucide-react';

const TicketsPage = lazy(() => import('@/features/tickets/TicketsPage').then((m) => ({ default: m.TicketsPage })));
const JobsPage = lazy(() => import('@/features/jobs/JobsPage').then((m) => ({ default: m.JobsPage })));
const InvoicingPage = lazy(() => import('@/features/invoicing/InvoicingPage').then((m) => ({ default: m.InvoicingPage })));
const TimeclockPage = lazy(
  () => import('@/features/timeclock/TimeclockPage').then((m) => ({ default: m.TimeclockPage })),
);
const TeamPage = lazy(() => import('@/features/team/TeamPage').then((m) => ({ default: m.TeamPage })));
const SettingsPage = lazy(
  () => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const DispatchPage = lazy(
  () => import('@/features/dispatch/DispatchPage').then((m) => ({ default: m.DispatchPage })),
);
const MyJobsPage = lazy(
  () => import('@/features/dispatch/MyJobsPage').then((m) => ({ default: m.MyJobsPage })),
);

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

function Root() {
  const { user, loading } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  const wantsAuth = mode === 'signin' || mode === 'signup' || mode === 'owner';

  if (loading) return <BootScreen />;

  if (!user) {
    if (!wantsAuth) return <LandingPage />;
    if (mode === 'owner' || mode === 'signup') return <OwnerAuth />;
    return <AuthScreen mode="signin" />;
  }

  return <Workspace />;
}

function Workspace() {
  const { user, organization, isAdmin, loading, signOut } = useAuth();
  const [activePage, setActivePage] = useState('tickets');
  const needsSetup = Boolean(user?.user_metadata?.needs_setup);

  const orgId = organization?.id ?? null;
  const jobs = useJobNames(orgId);
  const employees = useEmployees(orgId);
  const [ticketRefreshKey, setTicketRefreshKey] = useState(0);
  const refreshAll = () => {
    setTicketRefreshKey((k) => k + 1);
    void jobs.refresh();
    void employees.refresh();
  };

  // Invoices feed the billing badges on the ticket list.
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceTickets, setInvoiceTickets] = useState<string[] | null>(null);
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    fetchInvoices(orgId)
      .then((list) => {
        if (!cancelled) setInvoices(list);
      })
      .catch(() => {
        if (!cancelled) setInvoices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, activePage, ticketRefreshKey]);
  const billingByTicket = useMemo(() => {
    const map = new Map<string, 'billed' | 'draft'>();
    for (const [ticketId, billing] of buildBillingIndex(invoices)) {
      map.set(ticketId, billing.state === 'billed' ? 'billed' : 'draft');
    }
    return map;
  }, [invoices]);

  if (needsSetup) return <CompleteAccount />;

  // Signed in but no workspace loaded yet (fresh signup, invite being claimed,
  // or a failed fetch) — show a wait screen instead of an empty shell.
  if (!organization) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 px-5">
        <div className={`flex max-w-sm flex-col items-center text-center ${loading ? '' : 'animate-fade-up'}`}>
          {loading ? (
            <>
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
              <p className="mt-3 text-xs font-medium text-ink-400">Setting up your workspace…</p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-ink-50">Almost there</h1>
              <p className="mt-2 text-sm text-ink-400">
                Your workspace is taking a moment to appear. If you were invited by an employer,
                they may not have sent the invite yet.
              </p>
              <div className="mt-6 flex gap-2">
                <Button variant="secondary" onClick={() => window.location.reload()}>
                  Try again
                </Button>
                <Button variant="ghost" onClick={() => void signOut()}>
                  Sign out
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const daysLeft = computeTrialDaysLeft(organization);
  if (daysLeft !== null && daysLeft <= 0) return <TrialPaywall onNavigate={setActivePage} />;

  // Google sign-ups skip the signup wizard, so business details are collected
  // once inside the app. Existing owners can skip without being asked again.
  const skippedBusinessDetails = localStorage.getItem('businessDetailsDone') === '1';
  if (!organization.industry && !skippedBusinessDetails && isAdmin) {
    return <BusinessDetailsForm onDone={() => localStorage.setItem('businessDetailsDone', '1')} />;
  }

  const metadataName = (user?.user_metadata?.name as string | undefined)?.trim() ?? '';
  const linkedEmployeeName =
    employees.employees.find((emp) => emp.user_id === user?.id)?.name.trim() ?? '';
  const emailFallback = (user?.email ?? '').split('@')[0].trim();
  // Always prefer the verified employee record so the "Created by" default
  // matches the creator dropdown; metadata name is only a fallback.
  const currentUserName =
    linkedEmployeeName || metadataName || emailFallback;

  const navigate = (pageId: string) => {
    const def = PAGE_REGISTRY.find((p) => p.id === pageId);
    if (def?.minRole === 'admin' && !isAdmin) return;
    setActivePage(pageId);
  };

  return (
    <AppShell activePage={activePage} onNavigate={navigate}>
      <SafeModule moduleName="Workspace" key={`${activePage}-${ticketRefreshKey}`}>
        <Suspense fallback={<SkeletonList rows={4} />}>
          {activePage === 'tickets' && organization && (
          <TicketsPage
            orgId={organization.id}
            jobs={jobs.jobs}
            employees={employees.employees}
            recipientEmail={organization.default_recipient_email}
            isAdmin={isAdmin}
            currentUserName={currentUserName}
            orgName={organization.name}
            billingByTicket={billingByTicket}
            onInvoiceFromTickets={(ids) => {
              setInvoiceTickets(ids);
              setActivePage('invoicing');
            }}
            onAddJob={jobs.addJob}
            onSent={refreshAll}
            workWeekStart={organization.work_week_start ?? 5}
          />
        )}
        {activePage === 'jobs' && organization && <JobsPage orgId={organization.id} orgName={organization.name} />}
        {activePage === 'dispatch' && organization && <DispatchPage orgId={organization.id} />}
        {activePage === 'myjobs' && organization && <MyJobsPage orgId={organization.id} />}
        {activePage === 'invoicing' && organization && (
          <InvoicingPage
            orgId={organization.id}
            orgName={organization.name}
            pendingTicketIds={invoiceTickets}
            onPendingTicketsHandled={() => setInvoiceTickets(null)}
          />
        )}
        {activePage === 'timeclock' && organization && (
          <TimeclockPage
            orgId={organization.id}
            employees={employees.employees}
            workWeekStart={organization.work_week_start ?? 5}
          />
        )}
        {activePage === 'team' && organization && (
          <TeamPage orgId={organization.id} seatLimit={organization.seat_limit} />
        )}
        {activePage === 'settings' && <SettingsPage />}
        </Suspense>
      </SafeModule>
    </AppShell>
  );
}

function BootScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950">
      <div className="flex flex-col items-center gap-3">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
        <p className="text-xs font-medium text-ink-400">Loading your workspace…</p>
      </div>
    </div>
  );
}
