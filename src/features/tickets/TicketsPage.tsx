import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Page, PageHeader } from '@/components/ui/Page';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, SkeletonList, ErrorState } from '@/components/ui/States';
import { TicketForm, CrewChip, type TicketDraft } from './TicketForm';
import { TicketDrawer } from './TicketDrawer';
import {
  createTicket,
  deleteTicket,
  fetchTickets,
  fetchTicketItems,
  addTicketItem,
  updateTicketItem,
  deleteTicketItem,
  syncTicketItems,
  filterTickets,
  groupByJobName,
  mailtoLink,
  updateTicket,
  type TicketFilters as Filters,
} from './ticketsService';
import type { Employee, Invoice, JobName, Ticket, TicketItemRow } from '@/config/types';
import { formatDate, formatDateShort, formatTime12h, startOfWeek } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { Plus, Search, Send, Trash2, Pencil, List, LayoutGrid, FileText, CalendarDays, Clock3, ArrowUpRight, ChevronRight, BriefcaseBusiness, Receipt, X, CheckSquare, Square } from 'lucide-react';

interface TicketsPageProps {
  orgId: string;
  jobs: JobName[];
  employees: Employee[];
  recipientEmail: string;
  isAdmin: boolean;
  currentUserName: string;
  orgName: string;
  /** Ticket id -> billing claim ("billed" or "draft") from the invoices tab. */
  billingByTicket: Map<string, 'billed' | 'draft'>;
  onAddJob: (name: string) => Promise<boolean>;
  onSent: () => void;
  workWeekStart: number;
  /** Open the invoice builder with these tickets preselected (admin flow). */
  onInvoiceFromTickets: (ticketIds: string[]) => void;
}

const SORTS = [
  { key: 'recent', label: 'Most recent' },
  { key: 'date-desc', label: 'Job date — newest' },
  { key: 'date-asc', label: 'Job date — oldest' },
  { key: 'job-name', label: 'Job name — A to Z' },
  { key: 'status', label: 'Status — drafts first' },
];

function oneMonthAgoIso(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

function oneWeekAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultRangeFor(view: 'sent' | 'completed'): { rangeStart: string; rangeEnd: string } {
  return view === 'sent'
    ? { rangeStart: oneWeekAgoIso(), rangeEnd: todayIso() }
    : { rangeStart: oneMonthAgoIso(), rangeEnd: todayIso() };
}

async function supabaseUpdate(id: string, updates: Partial<Ticket>) {
  return supabase.from('job_tickets').update(updates).eq('id', id).select().maybeSingle();
}

function formatRelativeDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value));
}

function timeLabel(t: Ticket) {
  return t.start_time
    ? `${formatTime12h(t.start_time)}${t.end_time ? ` – ${formatTime12h(t.end_time)}` : ''}`
    : 'Time TBD';
}

export function TicketsPage({
  orgId,
  jobs,
  employees,
  recipientEmail,
  isAdmin,
  currentUserName,
  orgName,
  billingByTicket,
  onInvoiceFromTickets,
  onAddJob,
  onSent,
  workWeekStart,
}: TicketsPageProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [itemsByTicket, setItemsByTicket] = useState<Record<string, TicketItemRow[]>>({});
  const [loading, setLoading] = useState(true);
  const everLoaded = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Ticket | null>(null);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filters>({
    search: '',
    view: isAdmin ? 'sent' : 'drafts',
    sortKey: 'job-name',
    groupByJob: true,
    rangeStart: '',
    rangeEnd: '',
  });

  const loadItems = useCallback(async (ticketIds: string[]) => {
    if (ticketIds.length === 0) return;
    const results = await Promise.all(ticketIds.map((id) => fetchTicketItems(id)));
    setItemsByTicket((prev) => {
      const next = { ...prev };
      ticketIds.forEach((id, i) => {
        next[id] = results[i];
      });
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    // First load shows skeletons; later refreshes keep the list on screen.
    setLoading(!everLoaded.current);
    setError(null);
    try {
      const list = await fetchTickets(orgId);
      setTickets(list);
      everLoaded.current = true;
      void loadItems(list.map((t) => t.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load tickets.');
    } finally {
      setLoading(false);
    }
  }, [orgId, loadItems]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // Realtime: keep the ticket list and open drawer live for everyone viewing.
  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = () => {
      channel = supabase
        .channel(`tickets-${orgId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'job_tickets', filter: `organization_id=eq.${orgId}` },
          (payload) => {
            if (payload.eventType === 'INSERT' && payload.new) {
              const created = payload.new as Ticket;
              setTickets((prev) => (prev.some((t) => t.id === created.id) ? prev : [created, ...prev]));
              void loadItems([created.id]);
            } else if (payload.eventType === 'UPDATE' && payload.new) {
              const updated = payload.new as Ticket;
              setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
              setActiveTicket((cur) => (cur?.id === updated.id ? updated : cur));
            } else if (payload.eventType === 'DELETE' && payload.old) {
              const removed = payload.old as { id?: string };
              if (removed.id) {
                setTickets((prev) => prev.filter((t) => t.id !== removed.id));
                setActiveTicket((cur) => (cur?.id === removed.id ? null : cur));
              }
            }
          },
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_items' }, (payload) => {
          const row = (payload.new ?? payload.old) as TicketItemRow | null;
          if (!row?.ticket_id) return;
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setItemsByTicket((prev) => {
              const list = prev[row.ticket_id] ?? [];
              if (prev[row.ticket_id]?.some((i) => i.id === row.id) && payload.eventType === 'INSERT') return prev;
              const next = [...list.filter((i) => i.id !== row.id), row as TicketItemRow].sort(
                (a, b) => a.sort_index - b.sort_index,
              );
              return { ...prev, [row.ticket_id]: next };
            });
          } else if (payload.eventType === 'DELETE') {
            setItemsByTicket((prev) => {
              const list = prev[row.ticket_id];
              if (!list) return prev;
              return { ...prev, [row.ticket_id]: list.filter((i) => i.id !== row.id) };
            });
          }
        })
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' && !stopped) {
            retry = setTimeout(connect, 2000);
          }
        });
    };

    connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [orgId, loadItems]);

  const visible = useMemo(() => filterTickets(tickets, filters), [tickets, filters]);
  const groups = useMemo(() => groupByJobName(visible), [visible]);
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const toggleJob = (key: string) =>
    setExpandedJobs((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const assignedToMe = useCallback(
    (t: Ticket) => t.names.includes(currentUserName),
    [currentUserName],
  );

  const itemsFor = useCallback(
    (t: Ticket) => itemsByTicket[t.id] ?? [],
    [itemsByTicket],
  );
  const tasksFor = useCallback(
    (t: Ticket) => itemsFor(t).filter((i) => i.kind === 'task').map((i) => i.content),
    [itemsFor],
  );

  const visibleForRole = useMemo(
    () =>
      isAdmin
        ? visible
        : visible.filter((t) => t.created_by === currentUserName || assignedToMe(t)),
    [visible, isAdmin, currentUserName, assignedToMe],
  );

  // Completed, not-yet-billed tickets are the invoice-ready pool.
  const selectableForInvoice = useMemo(
    () => visibleForRole.filter((t) => t.completed_at && billingByTicket.get(t.id) !== 'billed'),
    [visibleForRole, billingByTicket],
  );

  // Drop stale selections when the pool changes (e.g. after invoicing).
  useEffect(() => {
    setSelectedIds((ids) => {
      const pool = new Set(selectableForInvoice.map((t) => t.id));
      const next = ids.filter((id) => pool.has(id));
      return next.length === ids.length ? ids : next;
    });
  }, [selectableForInvoice]);

  const toggleSelected = (id: string) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const toggleSelectAll = () =>
    setSelectedIds((ids) => (ids.length === selectableForInvoice.length ? [] : selectableForInvoice.map((t) => t.id)));

  const activeIndex = useMemo(
    () => (activeTicket ? visibleForRole.findIndex((t) => t.id === activeTicket.id) : -1),
    [activeTicket, visibleForRole],
  );

  const draftCount = useMemo(
    () => tickets.filter((t) => !t.sent_at && (isAdmin || t.created_by === currentUserName || assignedToMe(t))).length,
    [tickets, isAdmin, currentUserName, assignedToMe],
  );
  const sentThisWeekCount = useMemo(
    () =>
      tickets.filter(
        (t) =>
          t.sent_at &&
          !t.completed_at &&
          t.sent_at.slice(0, 10) >= startOfWeek(new Date(), workWeekStart) &&
          (isAdmin || t.created_by === currentUserName || assignedToMe(t)),
      ).length,
    [tickets, isAdmin, currentUserName, assignedToMe, workWeekStart],
  );

  const markSent = async (t: Ticket) => {
    const { data } = await supabaseUpdate(t.id, { sent_at: new Date().toISOString() });
    if (data) setActiveTicket(data);
  };

  const handleToggleCompleted = async (t: Ticket) => {
    try {
      const updated = await updateTicket(t.id, {
        completed_at: t.completed_at ? null : new Date().toISOString(),
        organization_id: t.organization_id,
      });
      setTickets((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      if (activeTicket?.id === updated.id) setActiveTicket(updated);
      setNotice(t.completed_at ? 'Ticket marked as not completed.' : 'Ticket marked as completed.');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not update the ticket.');
    }
  };

  const saveTicket = async (draft: TicketDraft, sendNow: boolean) => {
    try {
      if (editing) {
        const updated = await updateTicket(editing.id, { ...draft, organization_id: editing.organization_id });
        await syncTicketItems(editing.id, draft.tasks, draft.materials, editing.organization_id);
        setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        if (activeTicket?.id === updated.id) setActiveTicket(updated);
        setNotice(sendNow ? 'Ticket submitted.' : 'Ticket updated.');
      } else {
        const created = await createTicket({ ...draft, organization_id: orgId });
        await syncTicketItems(created.id, draft.tasks, draft.materials, orgId);
        setTickets((prev) => [created, ...prev]);
        setNotice(sendNow ? 'Ticket submitted.' : 'Ticket saved.');
      }
      void refresh();
      setEditing(null);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not save the ticket.');
    }
  };

  const canSubmit = (t: Ticket) => {
    const items = itemsByTicket[t.id] ?? [];
    return Boolean(
      t.created_by &&
        t.job_date &&
        t.start_time &&
        t.end_time &&
        t.names.length > 0 &&
        items.some((i) => i.kind === 'task'),
    );
  };

  const handleSubmit = async (t: Ticket) => {
    if (!canSubmit(t)) {
      setNotice('This ticket is missing required details. Add creator, date, times, crew, and tasks, then save it in the form before submitting.');
      return;
    }
    if (!t.sent_at) await markSent(t);
    setNotice('Ticket submitted.');
    await refresh();
  };

  const handleDelete = async (t: Ticket) => {
    await deleteTicket(t.id);
    if (activeTicket?.id === t.id) setActiveTicket(null);
    setNotice('Ticket removed.');
    await refresh();
  };

  const handleUpdate = async (t: Ticket, updates: Partial<Ticket>) => {
    try {
      const updated = await updateTicket(t.id, { ...updates, organization_id: t.organization_id });
      setTickets((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      if (activeTicket?.id === updated.id) setActiveTicket(updated);
      setNotice('Ticket updated.');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not update the ticket.');
    }
  };

  const handleAddItem = async (t: Ticket, kind: 'task' | 'material', content: string) => {
    try {
      await addTicketItem(t.id, kind, content, t.organization_id);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not add the item.');
    }
  };

  const handleEditItem = async (_t: Ticket, item: TicketItemRow, content: string) => {
    try {
      await updateTicketItem(item.id, content);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not update the item.');
    }
  };

  const handleDeleteItem = async (_t: Ticket, item: TicketItemRow) => {
    try {
      await deleteTicketItem(item.id);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not remove the item.');
    }
  };

  const startInvoice = () => {
    if (selectedIds.length === 0) return;
    onInvoiceFromTickets(selectedIds);
  };

  return (
    <Page>
      <PageHeader
        title="Job tickets"
        description="Create, submit, and track tickets for your crew."
        actions={
          <Button
            icon={<Plus size={16} />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            New ticket
          </Button>
        }
      />

      {notice && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs animate-fade-up ${
            notice.startsWith("Couldn't") || notice.startsWith('Could not')
              ? 'border-error-500/30 bg-error-500/10 text-error-300'
              : 'border-green-500/30 bg-green-500/10 text-green-300'
          }`}
        >
          {notice}
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="ml-auto text-ink-400 hover:text-ink-100">
            ×
          </button>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 animate-fade-up">
        <button
          onClick={() => setFilters((f) => ({ ...f, view: 'drafts' }))}
          className="card p-4 text-left transition-colors hover:border-green-500/50"
        >
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-400">DRAFTS</p>
          <p className="mt-1 font-display text-2xl font-bold text-ink-50 tabular-nums">{draftCount}</p>
          <p className="text-2xs text-ink-500">Tickets not sent yet</p>
        </button>
        <button
          onClick={() => setFilters((f) => ({ ...f, view: 'sent', ...defaultRangeFor('sent') }))}
          className="card p-4 text-left transition-colors hover:border-green-500/50"
        >
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-400">SENT</p>
          <p className="mt-1 font-display text-2xl font-bold text-ink-50 tabular-nums">{sentThisWeekCount}</p>
          <p className="text-2xs text-ink-500">Last 7 days</p>
        </button>
        <button
          onClick={() => setFilters((f) => ({ ...f, view: 'completed', ...defaultRangeFor('completed') }))}
          className="card col-span-2 sm:col-span-1 p-4 text-left transition-colors hover:border-green-500/50"
        >
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-400">READY TO INVOICE</p>
          <p className="mt-1 font-display text-2xl font-bold text-ink-50 tabular-nums">{selectableForInvoice.length}</p>
          <p className="text-2xs text-ink-500">Completed, not yet invoiced</p>
        </button>
      </div>

      {isAdmin && selectedIds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-2.5 animate-fade-up">
          <Receipt size={16} className="text-green-400" />
          <span className="text-xs font-semibold text-green-200">
            {selectedIds.length} completed ticket{selectedIds.length === 1 ? '' : 's'} selected
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="secondary" onClick={toggleSelectAll}>
              {selectedIds.length === selectableForInvoice.length ? 'Clear' : 'Select all completed'}
            </Button>
            <Button size="sm" icon={<Receipt size={14} />} onClick={startInvoice}>
              Create invoice
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])} aria-label="Clear selection">
              <X size={14} />
            </Button>
          </div>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2 animate-fade-up">
        <div className="flex rounded-lg border border-ink-600 bg-ink-850 p-0.5">
          {(['drafts', 'sent', ...(isAdmin ? (['completed'] as const) : [])] as const).map((v) => (
            <button
              key={v}
              onClick={() => setFilters((f) => ({ ...f, view: v, rangeStart: '', rangeEnd: '' }))}
              className={`rounded-md px-3.5 py-1.5 text-xs font-semibold capitalize transition-colors ${
                filters.view === v ? 'bg-green-600 text-white' : 'text-ink-300 hover:text-ink-100'
              }`}
            >
              {v === 'sent' ? 'SENT' : v.toUpperCase()}
            </button>
          ))}
        </div>
        {(filters.view === 'sent' || filters.view === 'completed' || filters.view === 'drafts') && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              className="field-input w-auto text-xs"
              value={filters.rangeStart}
              aria-label="From date"
              onChange={(e) => setFilters((f) => ({ ...f, rangeStart: e.target.value }))}
            />
            <span className="text-xs text-ink-400">to</span>
            <input
              type="date"
              className="field-input w-auto text-xs"
              value={filters.rangeEnd}
              aria-label="To date"
              onChange={(e) => setFilters((f) => ({ ...f, rangeEnd: e.target.value }))}
            />
            {(filters.rangeStart || filters.rangeEnd) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters((f) => ({ ...f, rangeStart: '', rangeEnd: '' }))}
              >
                Clear
              </Button>
            )}
          </div>
        )}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            className="field-input pl-9"
            placeholder="Search jobs, crew, tasks…"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </div>
        <select
          className="field-input w-auto"
          value={filters.sortKey}
          onChange={(e) => setFilters((f) => ({ ...f, sortKey: e.target.value }))}
          aria-label="Sort tickets"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          size="md"
          icon={filters.groupByJob ? <List size={15} /> : <LayoutGrid size={15} />}
          onClick={() => setFilters((f) => ({ ...f, groupByJob: !f.groupByJob }))}
          title={filters.groupByJob ? 'Flat list' : 'Group by job'}
        >
          {filters.groupByJob ? 'Flat' : 'Group'}
        </Button>
      </div>

      {loading ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : visibleForRole.length === 0 ? (
        <EmptyState
          icon={<Send size={20} />}
          title={
            filters.view === 'drafts'
              ? 'No drafts yet'
              : filters.view === 'completed'
                ? 'Nothing completed in this range'
                : 'Nothing sent this week'
          }
          description={
            filters.view === 'drafts'
              ? 'Create your first job ticket, save it as a draft, or submit it for the crew.'
              : filters.view === 'completed'
                ? 'Submitted tickets you mark as completed will show up here.'
                : 'Tickets you send will show up here for the rest of the week.'
          }
        />
      ) : filters.groupByJob ? (
        <div className="space-y-3">
          {groups.map((g) => {
            const isExpanded = expandedJobs.has(g.job);
            return (
              <div key={g.job} className="card overflow-hidden animate-fade-up">
                <button
                  className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left"
                  onClick={() => toggleJob(g.job)}
                >
                  <ChevronRight
                    size={16}
                    className={`text-ink-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  />
                  <BriefcaseBusiness size={17} className="text-green-400" />
                  <span className="flex-1 truncate text-sm font-bold text-ink-50">{g.job}</span>
                  <span className="rounded-full bg-ink-800 px-2 py-0.5 text-2xs font-semibold tabular-nums text-ink-300">
                    {g.tickets.length}
                  </span>
                </button>
                {isExpanded && (
                  <div className="divide-y divide-ink-700 border-t border-ink-700">
                    {g.tickets.map((t) => (
                      <TicketRow
                        key={t.id}
                        ticket={t}
                        taskCount={tasksFor(t).length}
                        billing={billingByTicket.get(t.id)}
                        selectable={isAdmin && selectableForInvoice.some((s) => s.id === t.id)}
                        checked={selectedIds.includes(t.id)}
                        onToggle={() => toggleSelected(t.id)}
                        onOpen={() => setActiveTicket(t)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibleForRole.map((t) => (
            <TicketRow
              key={t.id}
              ticket={t}
              taskCount={tasksFor(t).length}
              billing={billingByTicket.get(t.id)}
              selectable={isAdmin && selectableForInvoice.some((s) => s.id === t.id)}
              checked={selectedIds.includes(t.id)}
              onToggle={() => toggleSelected(t.id)}
              onOpen={() => setActiveTicket(t)}
            />
          ))}
        </div>
      )}

      {activeTicket && !formOpen && (
        <TicketDrawer
          ticket={activeTicket}
          orgName={orgName}
          items={itemsByTicket[activeTicket.id] ?? []}
          billing={billingByTicket.get(activeTicket.id)}
          onClose={() => setActiveTicket(null)}
          onEdit={(t) => {
            setEditing(t);
            setFormOpen(true);
          }}
          onSubmit={handleSubmit}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
          onAddItem={handleAddItem}
          onEditItem={handleEditItem}
          onDeleteItem={handleDeleteItem}
          onToggleCompleted={isAdmin ? handleToggleCompleted : undefined}
          position={
            activeIndex >= 0 ? { index: activeIndex, total: visibleForRole.length } : undefined
          }
          onPrev={
            activeIndex > 0
              ? () => setActiveTicket(visibleForRole[activeIndex - 1])
              : undefined
          }
          onNext={
            activeIndex >= 0 && activeIndex < visibleForRole.length - 1
              ? () => setActiveTicket(visibleForRole[activeIndex + 1])
              : undefined
          }
          isAdmin={isAdmin}
          canEditDetails={isAdmin || assignedToMe(activeTicket)}
          canManage={isAdmin || activeTicket.created_by === currentUserName}
          crewOptions={employees.map((emp) => emp.name)}
        />
      )}

      {formOpen && (
        <TicketForm
          open={formOpen}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSave={saveTicket}
          jobs={jobs}
          employees={employees}
          editing={editing}
          allowNewJob
          onAddJob={onAddJob}
          defaultCreatedBy={currentUserName}
          employeeChoices={employees}
          isAdmin={isAdmin}
        />
      )}
    </Page>
  );
}

function TicketRow({
  ticket,
  taskCount,
  billing,
  selectable,
  checked,
  onToggle,
  onOpen,
}: {
  ticket: Ticket;
  taskCount: number;
  billing?: 'billed' | 'draft';
  selectable: boolean;
  checked: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="flex w-full items-center transition-colors hover:bg-ink-850">
      {selectable && (
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={checked ? `Deselect ticket ${ticket.id}` : `Select ticket ${ticket.id}`}
          onClick={onToggle}
          className="flex h-full shrink-0 items-center px-2 border-r border-ink-700/60"
        >
          {checked ? <CheckSquare size={16} className="text-green-500" /> : <Square size={16} className="text-ink-500" />}
        </button>
      )}
      <button
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
        onClick={onOpen}
      >
        <CalendarDays size={16} className="shrink-0 text-green-400" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-ink-50">{formatDate(ticket.job_date)}</span>
            <span className="truncate text-xs text-ink-300">{ticket.job_name}</span>
          </div>
          <p className="mt-0.5 flex items-center gap-3 text-2xs text-ink-400">
            <span className="inline-flex items-center gap-1">
              <Clock3 size={11} /> {timeLabel(ticket)}
            </span>
            <span>
              {taskCount} task{taskCount === 1 ? '' : 's'}
            </span>
          </p>
        </div>
        <span className="hidden text-2xs text-ink-500 sm:block">{formatRelativeDate(ticket.created_at)}</span>
        {billing === 'billed' ? (
          <Badge tone="info">
            <Receipt size={10} /> Invoiced
          </Badge>
        ) : billing === 'draft' ? (
          <Badge tone="warning">
            <Receipt size={10} /> On draft
          </Badge>
        ) : ticket.completed_at ? (
          <Badge tone="green">Completed</Badge>
        ) : ticket.sent_at ? (
          <Badge tone="warning">Sent</Badge>
        ) : (
          <Badge tone="error">Draft</Badge>
        )}
        <ArrowUpRight size={15} className="shrink-0 text-ink-500" />
      </button>
    </div>
  );
}
