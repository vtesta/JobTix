import { useEffect, useMemo, useState } from 'react';
import { Page, PageHeader } from '@/components/ui/Page';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/States';
import { sanitizeText, isEmail } from '@/lib/format';
import { useJobNames } from '@/features/shared/workspaceService';
import { useAuth } from '@/hooks/AuthContext';
import { fetchTickets } from '@/features/tickets/ticketsService';
import {
  createInvoice,
  updateInvoice,
  fetchInvoices,
  fetchInvoiceLines,
  setInvoiceStatus,
  deleteInvoice,
  nextInvoiceNumber,
  invoiceTotals,
  formatMoney,
  printInvoice,
  buildBillingIndex,
  latestInvoiceForJob,
  saveClientInfoToJob,
  releaseTicketsFromDrafts,
  type InvoiceTab,
} from '@/features/jobs/invoicesService';
import { InvoiceDetailModal } from './InvoiceDetailModal';
import { generateAiLines } from './invoiceAi';
import {
  loadPriceMemories,
  getCachedMemories,
  recordInvoiceLines,
} from './priceBook';
import {
  ingestTickets,
  absorbDraftLines,
  updateGroup,
  removeTicketFromGroup,
  toDraftLines,
  nextGroupId,
  type GroupLine,
} from './groupLines';
import { TicketSelector } from './TicketSelector';
import { LineEditor } from './LineEditor';
import type { Invoice, InvoiceDraftLine, InvoiceLineItem, JobName, Ticket } from '@/config/types';
import {
  CheckSquare,
  FileClock,
  FileText,
  Layers,
  PencilLine,
  Plus,
  Receipt,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
interface InvoicingPageProps {
  orgId: string;
  orgName: string;
  /** Ticket ids handed over from the Tickets page "Create invoice" action. */
  pendingTicketIds?: string[] | null;
  onPendingTicketsHandled?: () => void;
}

type ModalState =
  | { kind: 'none' }
  | { kind: 'detail'; invoice: Invoice };

interface HeaderState {
  job_name: string;
  invoice_number: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  issue_date: string;
  due_date: string;
  notes: string;
  tax_rate_pct: string;
}

export function InvoicingPage({ orgId, orgName, pendingTicketIds, onPendingTicketsHandled }: InvoicingPageProps) {
  const { isAdmin, currentMembership } = useAuth();
  const { jobs, error: jobsError, refresh: refreshJobs } = useJobNames(orgId);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [linesById, setLinesById] = useState<Map<string, InvoiceLineItem[]>>(new Map());
  const [tab, setTab] = useState<'build' | 'invoices'>('build');
  const [invoiceTab, setInvoiceTab] = useState<InvoiceTab>('all');
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Ticket selector
  const [jobFilter, setJobFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Builder
  const [groups, setGroups] = useState<GroupLine[]>([]);
  const [ingestNote, setIngestNote] = useState<string | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [header, setHeader] = useState<HeaderState>(() => ({
    job_name: '',
    invoice_number: '',
    client_name: '',
    client_email: '',
    client_phone: '',
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: '',
    notes: '',
    tax_rate_pct: '0',
  }));

  // AI + price book
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const billingIndex = useMemo(() => buildBillingIndex(invoices), [invoices]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchTickets(orgId), fetchInvoices(orgId), loadPriceMemories(orgId)])
      .then(([t, inv]) => {
        if (cancelled) return;
        setTickets(t);
        setInvoices(inv);
        setLoading(false);
        void refreshInvoices();
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load tickets and invoices.');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const refreshInvoices = async () => {
    try {
      const list = await fetchInvoices(orgId);
      setInvoices(list);
      const results = await Promise.all(
        list.map(async (inv) => {
          try {
            return [inv.id, await fetchInvoiceLines(inv.id)] as const;
          } catch {
            return [inv.id, linesById.get(inv.id) ?? []] as const;
          }
        }),
      );
      setLinesById(new Map(results));
    } catch {
      setError('Could not load invoices.');
    }
  };

  const draftInvoices = useMemo(() => invoices.filter((i) => i.status === 'draft'), [invoices]);

  const jobByName = (name: string): JobName | undefined => jobs.find((j) => j.name === name);

  /**
   * Best client info for a job: the job's own fields, backfilled from the
   * most recent invoice ever created for that job (learning from history).
   */
  const clientInfoForJob = (jobName: string) => {
    const job = jobByName(jobName);
    const lastInvoice = latestInvoiceForJob(invoices, jobName);
    return {
      client_name: job?.client_name || lastInvoice?.client_name || '',
      client_email: job?.client_email || lastInvoice?.client_email || '',
      client_phone: job?.client_phone || lastInvoice?.client_phone || '',
      tax_rate_pct: header.tax_rate_pct || (lastInvoice ? String(lastInvoice.tax_rate_pct) : '0'),
      notes: header.notes || job?.notes || '',
    };
  };

  const filteredTickets = useMemo(
    () =>
      tickets
        .filter((t) => t.sent_at)
        .filter((t) => t.completed_at)
        .filter((t) => billingIndex.get(t.id)?.state !== 'billed')
        .filter((t) => (jobFilter ? t.job_name === jobFilter : true))
        .filter((t) => {
          if (!search.trim()) return true;
          const q = search.toLowerCase();
          return (
            t.job_name.toLowerCase().includes(q) ||
            t.names.join(' ').toLowerCase().includes(q) ||
            t.tasks.join(' ').toLowerCase().includes(q)
          );
        })
        .sort((a, b) => b.job_date.localeCompare(a.job_date)),
    [tickets, jobFilter, search, billingIndex],
  );

  const setField = (patch: Partial<HeaderState>) => setHeader((h) => ({ ...h, ...patch }));

  const resetBuilder = (job?: JobName) => {
    setEditingInvoice(null);
    setGroups([]);
    setIngestNote(null);
    setSelectedIds(new Set());
    setAiPrompt('');
    setAiNote(null);
    setHeader({
      job_name: job?.name ?? '',
      invoice_number: nextInvoiceNumber(invoices),
      client_name: job?.client_name ?? '',
      client_email: job?.client_email ?? '',
      client_phone: job?.client_phone ?? '',
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: '',
      notes: job?.notes ?? '',
      tax_rate_pct: '0',
    });
  };

  const toggleTicket = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllTickets = () =>
    setSelectedIds((prev) => {
      const allSelected = filteredTickets.length > 0 && filteredTickets.every((t) => prev.has(t.id));
      if (allSelected) return new Set();
      return new Set(filteredTickets.map((t) => t.id));
    });

  /** Batch ingest: pull every task/material from the selected tickets into grouped lines
   * and prefill the header with as much known client info as possible. */
  const ingestSelected = (picked: Ticket[]) => {
    if (picked.length === 0) {
      setIngestNote('Select at least one ticket first.');
      return;
    }
    const rate = Number(jobByName(header.job_name || picked[0].job_name)?.default_rate ?? 0);
    const { groups: next, stats } = ingestTickets(picked, groups, { defaultLaborRate: rate });
    setGroups(next);
    setSelectedIds(new Set());
    // Prefill the job + client fields from the job record, falling back to past invoices.
    const jobName = header.job_name || picked[0].job_name;
    const client = clientInfoForJob(jobName);
    setField({
      job_name: jobName,
      invoice_number: header.invoice_number || nextInvoiceNumber(invoices),
      ...client,
    });
    const parts = [
      `${stats.added} new line${stats.added === 1 ? '' : 's'}`,
      stats.absorbed > 0 ? `${stats.absorbed} item${stats.absorbed === 1 ? '' : 's'} grouped into existing lines` : null,
    ].filter(Boolean);
    setIngestNote(
      stats.added + stats.absorbed === 0
        ? 'Those tickets had no tasks or materials to pull.'
        : `Pulled from ${stats.tickets} ticket${stats.tickets === 1 ? '' : 's'}: ${parts.join(', ')}.`,
    );
  };

  const startEdit = async (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setTab('build');
    setModal({ kind: 'none' });
    let saved: InvoiceLineItem[];
    try {
      saved = await fetchInvoiceLines(invoice.id);
    } catch {
      setError('Could not load the invoice lines.');
      return;
    }
    const drafts: InvoiceDraftLine[] = saved.map((l) => ({
      kind: l.kind,
      description: l.description,
      ticket_ref: l.ticket_ref,
      ticket_id: l.ticket_id,
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
    }));
    setGroups(absorbDraftLines([], drafts));
    setSelectedIds(new Set());
    setIngestNote(null);
    setHeader({
      job_name: invoice.job_name,
      invoice_number: invoice.invoice_number,
      client_name: invoice.client_name,
      client_email: invoice.client_email,
      client_phone: invoice.client_phone,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date ?? '',
      notes: invoice.notes,
      tax_rate_pct: String(invoice.tax_rate_pct),
    });
  };

  const handleAiDraft = async () => {
    const pool = filteredTickets.slice(0, 20);
    if (pool.length === 0) {
      setAiNote('No completed tickets match — adjust the job or search first.');
      return;
    }
    setAiBusy(true);
    setAiNote(null);
    const result = await generateAiLines({
      instruction: aiPrompt || 'Draft line items for the completed work in these tickets.',
      defaultRate: Number(jobByName(header.job_name || pool[0].job_name)?.default_rate ?? 0),
      tickets: pool,
      priceHistory: getCachedMemories().slice(0, 60),
    });
    const before = groups.length;
    setGroups((gs) => absorbDraftLines(gs, result.lines.map((l) => ({ ...l, ticket_id: null }))));
    setAiNote(
      result.source === 'ai'
        ? `AI drafted ${result.lines.length} item${result.lines.length === 1 ? '' : 's'} using your past pricing — matching items merged into existing lines.`
        : 'AI is not configured yet — used a basic draft instead.',
    );
    if (groups.length !== before) setIngestNote(null);
    setAiBusy(false);
  };

  const validate = (): string | null => {
    if (!header.job_name) return 'Choose a job for this invoice.';
    if (!sanitizeText(header.invoice_number, 40)) return 'Invoice number is required.';
    if (header.client_email && !isEmail(header.client_email)) return 'Client email is not a valid address.';
    const tax = Number(header.tax_rate_pct);
    if (Number.isNaN(tax) || tax < 0 || tax > 100) return 'Tax rate must be between 0 and 100.';
    if (groups.length === 0) return 'Add at least one line item.';
    return null;
  };

  const save = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    const ticketIds = [...new Set(groups.flatMap((g) => g.ticketIds))];
    const cleanHeader = {
      job_name: sanitizeText(header.job_name, 120),
      invoice_number: sanitizeText(header.invoice_number, 40),
      client_name: sanitizeText(header.client_name, 120),
      client_email: sanitizeText(header.client_email, 160),
      client_phone: sanitizeText(header.client_phone, 40),
      issue_date: header.issue_date,
      due_date: header.due_date || null,
      notes: sanitizeText(header.notes, 2000),
      tax_rate_pct: Number(header.tax_rate_pct) || 0,
      ticket_ids: ticketIds,
    };
    const cleanLines: InvoiceDraftLine[] = toDraftLines(groups).map((l) => ({
      kind: l.kind,
      description: sanitizeText(l.description, 300) || '—',
      ticket_ref: sanitizeText(l.ticket_ref, 200),
      ticket_id: l.ticket_id ?? null,
      quantity: Math.max(0, Number(l.quantity) || 0),
      unit_price: Math.max(0, Number(l.unit_price) || 0),
    }));
    try {
      await releaseTicketsFromDrafts(orgId, invoices, ticketIds, editingInvoice?.id);
      if (editingInvoice) {
        await updateInvoice(editingInvoice.id, orgId, cleanHeader, cleanLines);
      } else {
        await createInvoice(orgId, currentMembership?.name ?? '', cleanHeader, cleanLines);
      }
      void recordInvoiceLines(orgId, cleanLines);
      // Learn: save any client details back onto the job for next time.
      void saveClientInfoToJob(orgId, cleanHeader.job_name, {
        client_name: cleanHeader.client_name,
        client_email: cleanHeader.client_email,
        client_phone: cleanHeader.client_phone,
        notes: cleanHeader.notes,
        tax_rate_pct: cleanHeader.tax_rate_pct,
      }).catch(() => undefined);
      await refreshInvoices();
      void refreshJobs();
      const number = cleanHeader.invoice_number;
      resetBuilder();
      const saved = invoices.find((i) => i.invoice_number === number);
      if (saved) setModal({ kind: 'detail', invoice: saved });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the invoice.');
    }
  };

  const totals = invoiceTotals(toDraftLines(groups), Number(header.tax_rate_pct) || 0);

  const filteredInvoices = useMemo(
    () => (invoiceTab === 'all' ? invoices : invoices.filter((i) => i.status === invoiceTab)),
    [invoices, invoiceTab],
  );
  const invoiceStatusCount = (status: InvoiceTab) =>
    status === 'all' ? invoices.length : invoices.filter((i) => i.status === status).length;

  const handleSetStatus = async (invoice: Invoice, status: Invoice['status']) => {
    try {
      await setInvoiceStatus(invoice.id, status);
      await refreshInvoices();
      if (modal.kind === 'detail') setModal({ kind: 'detail', invoice: { ...invoice, status } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the invoice.');
    }
  };

  const handleDeleteInvoice = async (invoice: Invoice) => {
    try {
      await deleteInvoice(invoice.id);
      setModal({ kind: 'none' });
      await refreshInvoices();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the invoice.');
    }
  };

  // Handoff from the Tickets page: select the tickets and ingest immediately.
  const lastPendingRef = useMemo(() => ({ current: null as string[] | null }), []);
  if (pendingTicketIds && pendingTicketIds !== lastPendingRef.current) {
    lastPendingRef.current = pendingTicketIds;
    if (pendingTicketIds.length > 0 && tickets.length > 0) {
      const picked = pendingTicketIds
        .map((id) => tickets.find((t) => t.id === id))
        .filter((t): t is Ticket => Boolean(t));
      if (picked.length > 0) {
        const job = jobs.find((j) => j.name === picked[0].job_name);
        setTab('build');
        setJobFilter(job?.name ?? '');
        setEditingInvoice(null);
        const client = clientInfoForJob(picked[0].job_name);
        setHeader((h) => ({
          ...h,
          job_name: job?.name ?? h.job_name,
          invoice_number: h.invoice_number || nextInvoiceNumber(invoices),
          ...client,
        }));
        ingestSelected(picked);
        onPendingTicketsHandled?.();
      }
    }
  }

  if (!isAdmin) {
    return (
      <Page>
        <EmptyState
          icon={<Receipt size={20} />}
          title="Admins only"
          description="Invoicing is limited to owners and admins."
        />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Invoicing"
        description="Select tickets, pull their work in as priced lines, and send the invoice."
        actions={
          <Button
            icon={<Plus size={16} />}
            onClick={() => {
              resetBuilder();
              setTab('build');
            }}
          >
            New invoice
          </Button>
        }
      />

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-error-600/40 bg-error-600/10 px-3 py-2 text-xs text-error-400">
          {error}
          <button onClick={() => setError(null)} className="ml-auto" aria-label="Dismiss">
            <X size={12} />
          </button>
        </div>
      )}

      <div className="mb-4 flex gap-1.5">
        <TabButton active={tab === 'build'} onClick={() => setTab('build')} icon={<FileText size={14} />} label="Build" />
        <TabButton active={tab === 'invoices'} onClick={() => setTab('invoices')} icon={<Receipt size={14} />} label="Invoices" count={invoices.length} />
      </div>

      {jobsError && <p className="mb-3 text-xs text-error-400">{jobsError} <button onClick={() => void refreshJobs()} className="underline">Retry</button></p>}

      {loading ? (
        <p className="text-xs text-ink-400">Loading…</p>
      ) : tab === 'build' ? (
        <div className="space-y-4">
          {draftInvoices.length > 0 && !editingInvoice && (
            <DraftsStrip
              drafts={draftInvoices}
              linesById={linesById}
              onContinue={(inv) => void startEdit(inv)}
            />
          )}
          {editingInvoice && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warning-500/40 bg-warning-500/10 px-3 py-2.5">
              <PencilLine size={14} className="shrink-0 text-warning-400" />
              <p className="text-xs text-warning-200">
                Editing draft <span className="font-bold">{editingInvoice.invoice_number}</span> —
                tickets you add below merge into this same draft as the job progresses.
              </p>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => resetBuilder()}>
                Start new invoice instead
              </Button>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          {/* Ticket selector */}
          <div className="space-y-2">
            <div className="card p-3">
              <select
                className="field-input text-xs"
                value={jobFilter}
                onChange={(e) => setJobFilter(e.target.value)}
                aria-label="Filter by job"
              >
                <option value="">All jobs</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.name}>{j.name}</option>
                ))}
              </select>
              <div className="relative mt-2">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  className="field-input pl-8 text-xs"
                  placeholder="Search crew, tasks…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <TicketSelector
              tickets={filteredTickets}
              selectedIds={selectedIds}
              onToggle={toggleTicket}
              onToggleAll={toggleAllTickets}
              onClear={() => setSelectedIds(new Set())}
            />
            <Button
              fullWidth
              icon={<Layers size={15} />}
              disabled={selectedIds.size === 0}
              onClick={() =>
                ingestSelected(
                  [...selectedIds].map((id) => tickets.find((t) => t.id === id)).filter((t): t is Ticket => Boolean(t)),
                )
              }
            >
              Add selected tickets
            </Button>
          </div>

          {/* Builder column */}
          <div className="space-y-4">
            {/* AI bar */}
            <div className="card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Sparkles size={15} className="shrink-0 text-green-400" />
                <input
                  className="field-input min-w-[160px] flex-1 text-xs"
                  placeholder='Ask AI: "Draft lines for the panel upgrade and permits" — matching items merge in'
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  maxLength={1000}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleAiDraft();
                  }}
                />
                <Button size="sm" loading={aiBusy} icon={<Sparkles size={13} />} onClick={() => void handleAiDraft()}>
                  Draft lines
                </Button>
              </div>
              {aiNote && <p className="mt-2 text-2xs text-ink-400">{aiNote}</p>}
              {ingestNote && (
                <p className="mt-2 flex items-center gap-1.5 text-2xs text-green-400">
                  <CheckSquare size={11} /> {ingestNote}
                </p>
              )}
            </div>

            {/* Invoice header */}
            <div className="card p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-ink-400">Job</label>
                  <select
                    className="field-input text-xs"
                    value={header.job_name}
                    onChange={(e) => {
                      const job = jobByName(e.target.value);
                      setField({
                        job_name: e.target.value,
                        client_name: job?.client_name ?? '',
                        client_email: job?.client_email ?? '',
                        client_phone: job?.client_phone ?? '',
                        notes: header.notes || job?.notes || '',
                      });
                    }}
                  >
                    <option value="">Choose a job…</option>
                    {jobs.map((job) => (
                      <option key={job.id} value={job.name}>{job.name}</option>
                    ))}
                  </select>
                </div>
                <Input label="Invoice number" value={header.invoice_number} onChange={(e) => setField({ invoice_number: e.target.value })} maxLength={40} />
                <Input label="Client name" value={header.client_name} onChange={(e) => setField({ client_name: e.target.value })} maxLength={120} />
                <Input label="Client email" type="email" value={header.client_email} onChange={(e) => setField({ client_email: e.target.value })} maxLength={160} />
                <Input label="Client phone" value={header.client_phone} onChange={(e) => setField({ client_phone: e.target.value })} maxLength={40} />
                <Input label="Tax rate (%)" type="number" min={0} max={100} step="0.1" value={header.tax_rate_pct} onChange={(e) => setField({ tax_rate_pct: e.target.value })} />
                <Input label="Issue date" type="date" value={header.issue_date} onChange={(e) => setField({ issue_date: e.target.value })} />
                <Input label="Due date" type="date" value={header.due_date} onChange={(e) => setField({ due_date: e.target.value })} />
              </div>
              <div className="mt-3">
                <Input label="Notes" value={header.notes} onChange={(e) => setField({ notes: e.target.value })} maxLength={2000} />
              </div>
            </div>

            {/* Grouped line editor */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-2xs font-bold uppercase tracking-wider text-ink-400">
                  Line items ({groups.length})
                </p>
                {groups.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setGroups([])}>
                    Clear all
                  </Button>
                )}
              </div>
              <LineEditor
                groups={groups}
                onPatch={(id, patch) => setGroups((gs) => updateGroup(gs, id, patch))}
                onRemove={(id) => setGroups((gs) => gs.filter((g) => g.id !== id))}
                onRemoveTicket={(id, refIndex) => setGroups((gs) => removeTicketFromGroup(gs, id, refIndex))}
                onAddBlank={(kind) =>
                  setGroups((gs) => [
                    ...gs,
                    {
                      id: nextGroupId(),
                      kind,
                      description: '',
                      unit_price: kind === 'labor' ? Number(jobByName(header.job_name)?.default_rate ?? 0) : 0,
                      quantity: 1,
                      ticketIds: [],
                      ticketRefs: [],
                      learnedPrice: false,
                    },
                  ])
                }
              />
              {groups.length > 0 && (
                <div className="card mt-3 p-3">
                  <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
                    <div className="flex justify-between text-ink-300"><span>Subtotal</span><span className="tabular-nums">{formatMoney(totals.subtotal)}</span></div>
                    <div className="flex justify-between text-ink-300"><span>Tax ({header.tax_rate_pct}%)</span><span className="tabular-nums">{formatMoney(totals.tax)}</span></div>
                    <div className="flex justify-between border-t border-ink-700 pt-1.5 font-display text-base font-bold text-ink-50">
                      <span>Total</span><span className="tabular-nums">{formatMoney(totals.total)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Save bar */}
            <div className="flex flex-wrap items-center gap-2">
              {editingInvoice && (
                <Button variant="ghost" onClick={() => resetBuilder()}>Cancel edit</Button>
              )}
              <div className="ml-auto flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setTab('invoices')}>View invoices</Button>
                <Button icon={<CheckSquare size={14} />} onClick={() => void save()}>
                  {editingInvoice ? 'Save changes' : 'Create invoice'}
                </Button>
              </div>
            </div>
          </div>
          </div>
        </div>
      ) : (
        /* Invoices list */
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'draft', 'sent', 'paid', 'void'] as InvoiceTab[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setInvoiceTab(s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                  invoiceTab === s ? 'bg-green-500/15 text-green-400 ring-1 ring-green-500/25' : 'bg-ink-800 text-ink-300 hover:bg-ink-700'
                }`}
              >
                {s} ({invoiceStatusCount(s)})
              </button>
            ))}
          </div>
          {filteredInvoices.length === 0 ? (
            <EmptyState
              icon={<Receipt size={20} />}
              title="No invoices yet"
              description="Build one from tickets on the Build tab."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-ink-700">
              {filteredInvoices.map((inv, i) => {
                const invLines = linesById.get(inv.id) ?? [];
                const t = invoiceTotals(invLines, Number(inv.tax_rate_pct) || 0);
                return (
                  <div
                    key={inv.id}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-ink-850 ${
                      i % 2 === 0 ? 'bg-ink-900' : 'bg-ink-900/60'
                    } ${i > 0 ? 'border-t border-ink-800' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => setModal({ kind: 'detail', invoice: inv })}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-ink-50">{inv.invoice_number} · {inv.job_name}</p>
                        <p className="truncate text-2xs text-ink-400">
                          {inv.client_name || 'No client'} · {inv.ticket_ids.length} ticket{inv.ticket_ids.length === 1 ? '' : 's'} · issued {inv.issue_date}
                        </p>
                      </div>
                      <Badge tone={inv.status === 'paid' ? 'green' : inv.status === 'sent' ? 'warning' : inv.status === 'void' ? 'error' : 'neutral'}>
                        {inv.status.toUpperCase()}
                      </Badge>
                      <span className="w-24 text-right font-display text-sm font-bold tabular-nums text-ink-50">
                        {formatMoney(t.total)}
                      </span>
                    </button>
                    {isAdmin && inv.status === 'draft' && (
                      <Button size="sm" variant="secondary" icon={<PencilLine size={12} />} onClick={() => void startEdit(inv)}>
                        Edit
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {modal.kind === 'detail' && (
        <InvoiceDetailModal
          invoice={invoices.find((i) => i.id === modal.invoice.id) ?? modal.invoice}
          lines={linesById.get(modal.invoice.id) ?? []}
          orgName={orgName}
          isAdmin={isAdmin}
          onClose={() => setModal({ kind: 'none' })}
          onEdit={() => void startEdit(modal.invoice)}
          onPrint={() => {
            try {
              printInvoice(modal.invoice, linesById.get(modal.invoice.id) ?? [], orgName);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not open the print view.');
            }
          }}
          onSetStatus={(status) => void handleSetStatus(modal.invoice, status)}
          onDelete={() => void handleDeleteInvoice(modal.invoice)}
        />
      )}
    </Page>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
        active ? 'bg-green-500/15 text-green-400 ring-1 ring-green-500/25' : 'bg-ink-800 text-ink-300 hover:bg-ink-700'
      }`}
    >
      {icon}
      {label}
      {count !== undefined && <span className="rounded-full bg-ink-700 px-1.5 text-2xs">{count}</span>}
    </button>
  );
}

/** Horizontal strip of draft invoices waiting to be continued. */
function DraftsStrip({
  drafts,
  linesById,
  onContinue,
}: {
  drafts: Invoice[];
  linesById: Map<string, InvoiceLineItem[]>;
  onContinue: (invoice: Invoice) => void;
}) {
  return (
    <div className="rounded-xl border border-warning-500/30 bg-warning-500/5 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-warning-300">
        <FileClock size={13} /> Drafts in progress
      </p>
      <div className="flex flex-wrap gap-2">
        {drafts.map((inv) => {
          const lines = linesById.get(inv.id) ?? [];
          const t = invoiceTotals(lines, Number(inv.tax_rate_pct) || 0);
          return (
            <button
              key={inv.id}
              type="button"
              onClick={() => onContinue(inv)}
              className="group flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-left transition-colors hover:border-warning-500/50 hover:bg-ink-850"
            >
              <div>
                <p className="text-xs font-bold text-ink-50">{inv.invoice_number} · {inv.job_name}</p>
                <p className="text-2xs text-ink-400">
                  {lines.length} line{lines.length === 1 ? '' : 's'} · {inv.ticket_ids.length} ticket{inv.ticket_ids.length === 1 ? '' : 's'} · {formatMoney(t.total)}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-2xs font-semibold text-warning-300 opacity-70 transition-opacity group-hover:opacity-100">
                <PencilLine size={11} /> Continue
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
