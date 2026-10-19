import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/AuthContext';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { APP_NAME, TRIAL_DAYS } from '@/config/app';
import { LogoMark } from '@/components/brand/Logo';
import { NotificationCenter } from '@/components/layout/NotificationCenter';
import {
  Briefcase,
  HardHat,
  LayoutDashboard,
  LogOut,
  Radar,
  Receipt,
  Settings,
  Timer,
  Users,
  MoreHorizontal,
  ChevronDown,
  TimerReset,
  Ticket as TicketIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/* ---------------- Page registry: add a page in one line ---------------- */

export interface PageDef {
  id: string;
  label: string;
  icon: LucideIcon;
  minRole?: 'admin' | 'owner';
  section: 'main' | 'manage';
}

export const PAGE_REGISTRY: PageDef[] = [
  { id: 'tickets', label: 'Tickets', icon: TicketIcon, section: 'main' },
  { id: 'dispatch', label: 'Dispatch', icon: Radar, minRole: 'admin', section: 'main' },
  { id: 'myjobs', label: 'My Jobs', icon: HardHat, section: 'main' },
  { id: 'timeclock', label: 'Timeclock', icon: Timer, section: 'main' },
  { id: 'jobs', label: 'Jobs', icon: Briefcase, minRole: 'admin', section: 'main' },
  { id: 'invoicing', label: 'Invoicing', icon: Receipt, minRole: 'admin', section: 'main' },
  { id: 'team', label: 'Team', icon: Users, minRole: 'admin', section: 'manage' },
  { id: 'settings', label: 'Configuration', icon: Settings, minRole: 'admin', section: 'manage' },
];

/* ---------------- Shell ---------------- */

interface AppShellProps {
  activePage: string;
  onNavigate: (pageId: string) => void;
  children: React.ReactNode;
}

export function AppShell({ activePage, onNavigate, children }: AppShellProps) {
  const { organization, memberships, currentMembership, isAdmin, switchOrganization, signOut } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const visiblePages = useMemo(
    () =>
      PAGE_REGISTRY.filter((p) => {
        if (!p.minRole) return true;
        if (p.minRole === 'admin') return isAdmin;
        if (p.minRole === 'owner') return currentMembership?.role === 'owner';
        return true;
      }),
    [isAdmin, currentMembership],
  );

  const firstName = (currentMembership?.name || organization?.name || 'there').split(' ')[0];
  const trialDaysLeft = useMemo(() => {
    if (!organization || organization.subscription_status !== 'trialing') return null;
    const created = new Date(organization.created_at).getTime();
    const elapsed = (Date.now() - created) / 86_400_000;
    return Math.max(0, Math.ceil(TRIAL_DAYS - elapsed));
  }, [organization]);

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar */}
      <aside className="sticky top-0 z-30 hidden h-screen w-60 shrink-0 flex-col border-r border-ink-800 bg-ink-900/80 backdrop-blur lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <LogoMark size={32} />
          <span className="font-display text-base font-bold text-ink-50">{APP_NAME}</span>
        </div>

        <nav className="flex-1 space-y-0.5 px-3">
          {(['main', 'manage'] as const).map((section) => {
            const pages = visiblePages.filter((p) => p.section === section);
            if (!pages.length) return null;
            return (
              <div key={section} className="mb-4">
                {section === 'manage' && (
                  <p className="mb-1.5 px-2.5 text-2xs font-bold uppercase tracking-widest text-ink-500">Manage</p>
                )}
                {pages.map((p) => {
                  const Icon = p.icon;
                  const active = activePage === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => onNavigate(p.id)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                        active
                          ? 'bg-green-500/15 text-green-400 ring-1 ring-green-500/25'
                          : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100'
                      }`}
                    >
                      <Icon size={16} />
                      {p.label}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-ink-800 p-3">
          <WorkspaceChip onClick={() => setSwitcherOpen(true)} />
        </div>
      </aside>

      {/* Main column */}
      <div className="min-w-0 flex-1">
        {/* Top bar (mobile nav + profile) */}
        <header className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950/90 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2 lg:hidden">
              <LogoMark size={28} />
              <span className="font-display text-sm font-bold text-ink-50">{APP_NAME}</span>
            </div>
            <div className="hidden lg:block" />
            <div className="flex items-center gap-2.5">
              {trialDaysLeft !== null && (
                <Badge tone={trialDaysLeft <= 3 ? 'warning' : 'info'}>
                  <TimerReset size={11} />
                  {trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'} left in trial
                </Badge>
              )}
              <NotificationCenter onNavigate={onNavigate} />
              <div className="relative">
                <button
                  onClick={() => setProfileOpen((o) => !o)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-700 text-xs font-bold text-ink-100 ring-1 ring-ink-600 transition-colors hover:ring-green-500/50"
                  aria-label="Profile menu"
                >
                  {firstName.charAt(0).toUpperCase()}
                </button>
                {profileOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
                    <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-ink-700 bg-ink-900 p-1.5 shadow-pop animate-scale-in">
                      <div className="px-3 py-2">
                        <p className="truncate text-sm font-semibold text-ink-100">{currentMembership?.name || 'Member'}</p>
                        <p className="truncate text-2xs capitalize text-ink-400">{currentMembership?.role ?? ''}</p>
                      </div>
                      <div className="my-1 border-t border-ink-700" />
                      <button
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-ink-300 hover:bg-ink-800 hover:text-ink-100"
                        onClick={() => void signOut()}
                      >
                        <LogOut size={14} /> Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="pb-20 lg:pb-0">{children}</main>
      </div>

      {/* Mobile bottom nav: the four daily screens, thumb-reachable */}
      <MobileBottomNav visiblePages={visiblePages} activePage={activePage} onNavigate={onNavigate} />

      <Modal
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        title="Your workspaces"
        description="Switch between organizations you belong to."
        width="sm"
      >
        <div className="space-y-1.5">
          {memberships.map((m) => (
            <button
              key={m.organization_id}
              onClick={async () => {
                if (await switchOrganization(m.organization_id)) setSwitcherOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                m.organization_id === organization?.id
                  ? 'border-green-500 bg-green-500/10'
                  : 'border-ink-600 bg-ink-850 hover:border-ink-500'
              }`}
            >
              <span className="text-sm font-semibold text-ink-100">{organization?.id === m.organization_id ? organization.name : 'Workspace'}</span>
              <Badge tone={m.role === 'owner' ? 'green' : 'neutral'}>{m.role}</Badge>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function MobileBottomNav({
  visiblePages,
  activePage,
  onNavigate,
}: {
  visiblePages: PageDef[];
  activePage: string;
  onNavigate: (pageId: string) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { isAdmin } = useAuth();
  // Admins dispatch; crew work their own jobs. The third slot is always Timeclock.
  const wanted = isAdmin ? ['tickets', 'dispatch', 'timeclock'] : ['tickets', 'myjobs', 'timeclock'];
  const primaryIds = wanted.filter((id) => visiblePages.some((p) => p.id === id));
  const primary = primaryIds.map((id) => visiblePages.find((p) => p.id === id) as PageDef);
  const rest = visiblePages.filter((p) => !primaryIds.includes(p.id));
  const moreActive = rest.some((p) => p.id === activePage);

  const items: { def: PageDef; onClick: () => void }[] = [
    ...primary.map((def) => ({ def, onClick: () => onNavigate(def.id) })),
    ...(rest.length > 0
      ? [{ def: { id: 'more', label: 'More', icon: MoreHorizontal } as PageDef, onClick: () => setMoreOpen(true) }]
      : []),
  ];

  return (
    <>
      {moreOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-ink-950/60 lg:hidden" onClick={() => setMoreOpen(false)} />
          <div className="fixed bottom-[68px] left-3 right-3 z-50 rounded-2xl border border-ink-700 bg-ink-900 p-2 shadow-pop animate-fade-up lg:hidden">
            <div className="grid grid-cols-4 gap-1">
              {rest.map((p) => {
                const Icon = p.icon;
                const active = activePage === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setMoreOpen(false);
                      onNavigate(p.id);
                    }}
                    className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-2xs font-semibold transition-colors ${
                      active ? 'bg-green-500/15 text-green-400' : 'text-ink-300 hover:bg-ink-800'
                    }`}
                  >
                    <Icon size={18} />
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-ink-800 bg-ink-950/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Primary"
      >
        {items.map(({ def, onClick }) => {
          const Icon = def.icon;
          const active = def.id === 'more' ? moreActive : activePage === def.id;
          return (
            <button
              key={def.id}
              onClick={onClick}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-2xs font-semibold transition-colors ${
                active ? 'text-green-400' : 'text-ink-400 hover:text-ink-200'
              }`}
            >
              <Icon size={20} />
              {def.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}

function WorkspaceChip({ onClick }: { onClick: () => void }) {
  const { organization, currentMembership } = useAuth();
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl border border-ink-700 bg-ink-850 px-3 py-2.5 text-left transition-colors hover:border-green-500/40"
    >
      <div className="min-w-0">
        <p className="text-2xs uppercase tracking-wider text-ink-500">Workspace</p>
        <p className="truncate text-xs font-semibold text-ink-100">{organization?.name ?? '—'}</p>
        <p className="text-2xs capitalize text-ink-400">{currentMembership?.role ?? ''}</p>
      </div>
      <ChevronDown size={14} className="shrink-0 text-ink-400" />
    </button>
  );
}
