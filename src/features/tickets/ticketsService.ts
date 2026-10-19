import { supabase } from '@/lib/supabase';
import type { Ticket, TicketItemRow } from '@/config/types';
import { formatTime12h, formatDate } from '@/lib/format';

export type TicketView = 'drafts' | 'sent' | 'completed';

export interface TicketFilters {
  search: string;
  view: TicketView;
  sortKey: string;
  groupByJob: boolean;
  /** Only used by the 'completed' view: YYYY-MM-DD bounds on completed_at. */
  rangeStart: string;
  rangeEnd: string;
}

export async function fetchTickets(orgId: string): Promise<Ticket[]> {
  const { data, error } = await supabase
    .from('job_tickets')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load tickets.');
  return (data ?? []) as Ticket[];
}

export async function createTicket(input: Partial<Ticket>): Promise<Ticket> {
  const { data, error } = await supabase
    .from('job_tickets')
    .insert(input)
    .select()
    .single();
  if (error) throw new Error('Could not save the ticket.');
  return data as Ticket;
}

export async function updateTicket(id: string, updates: Partial<Ticket>): Promise<Ticket> {
  const { data, error } = await supabase
    .from('job_tickets')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error('Could not update the ticket.');
  return data as Ticket;
}

export async function fetchTicketItems(ticketId: string): Promise<TicketItemRow[]> {
  const { data, error } = await supabase
    .from('ticket_items')
    .select('id, ticket_id, kind, content, sort_index')
    .eq('ticket_id', ticketId)
    .order('sort_index', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error('Could not load ticket details.');
  return (data ?? []) as TicketItemRow[];
}

export async function addTicketItem(
  ticketId: string,
  kind: 'task' | 'material',
  content: string,
  organizationId: string | null,
): Promise<void> {
  const { data: existing } = await supabase
    .from('ticket_items')
    .select('id')
    .eq('ticket_id', ticketId)
    .eq('kind', kind)
    .ilike('content', content)
    .limit(1);
  if (existing && existing.length > 0) return;
  const { data: last } = await supabase
    .from('ticket_items')
    .select('sort_index')
    .eq('ticket_id', ticketId)
    .eq('kind', kind)
    .order('sort_index', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextIndex = (last?.sort_index ?? -1) + 1;
  const { error } = await supabase
    .from('ticket_items')
    .insert({ ticket_id: ticketId, kind, content, sort_index: nextIndex, organization_id: organizationId });
  if (error) throw new Error('Could not add the item.');
}

export async function updateTicketItem(id: string, content: string): Promise<void> {
  const { error } = await supabase.from('ticket_items').update({ content }).eq('id', id);
  if (error) throw new Error('Could not update the item.');
}

export async function deleteTicketItem(id: string): Promise<void> {
  const { error } = await supabase.from('ticket_items').delete().eq('id', id);
  if (error) throw new Error('Could not remove the item.');
}

export async function syncTicketItems(
  ticketId: string,
  tasks: string[],
  materials: string[],
  organizationId: string | null,
): Promise<void> {
  const existing = await fetchTicketItems(ticketId);

  const plan = async (kind: 'task' | 'material', wanted: string[]) => {
    const rows = existing.filter((i) => i.kind === kind);
    const wantedClean = [...new Set(wanted.map((w) => w.trim()).filter(Boolean))];
    const toDelete = rows.filter((r) => !wantedClean.some((w) => w.toLowerCase() === r.content.toLowerCase()));
    const have = new Set(rows.map((r) => r.content.toLowerCase()));
    const toInsert = wantedClean.filter((w) => !have.has(w.toLowerCase()));
    for (const row of toDelete) {
      const { error } = await supabase.from('ticket_items').delete().eq('id', row.id);
      if (error) throw new Error('Could not update the ticket details.');
    }
    let index = rows.length > 0 ? Math.max(...rows.map((r) => r.sort_index)) + 1 : 0;
    for (const content of toInsert) {
      const { error } = await supabase
        .from('ticket_items')
        .insert({ ticket_id: ticketId, kind, content, sort_index: index++, organization_id: organizationId });
      if (error) throw new Error('Could not update the ticket details.');
    }
  };

  await plan('task', tasks);
  await plan('material', materials);
}

export async function deleteTicket(id: string): Promise<void> {
  const { error } = await supabase.from('job_tickets').delete().eq('id', id);
  if (error) throw new Error('Could not delete the ticket.');
}

export function ticketsToCsv(tickets: Ticket[]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = ['Job Name', 'Date', 'Crew', 'Start', 'End', 'Tasks', 'Materials', 'Created'].map(esc).join(',');
  const rows = tickets.map((t) =>
    [
      t.job_name,
      t.job_date,
      t.names.join('; '),
      t.start_time,
      t.end_time,
      t.tasks.join('; '),
      t.materials.join('; '),
      t.created_at.slice(0, 10),
    ]
      .map((v) => esc(String(v)))
      .join(','),
  );
  return [header, ...rows].join('\n');
}

function formatDateSlash(value: string): string {
  const d = new Date(`${value}T12:00:00`);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

function formatTimeForEmail(value: string): string {
  if (!value) return '—';
  return formatTime12h(value);
}

export function buildTicketEmail(t: Ticket, orgName = ''): { subject: string; body: string } {
  const bullets = (items: string[]) =>
    items.length ? items.map((n) => `• ${n}`).join('\n') : '• —';
  const body = [
    `[ JOB NAME ]\n\n• ${t.job_name}`,
    `[ DATE ]\n\n• ${formatDateSlash(t.job_date)}`,
    `[ NAMES ]\n\n${bullets(t.names)}`,
    `[ TIME ]\n\n• ${t.start_time ? formatTimeForEmail(t.start_time) : '—'}${t.end_time ? ` - ${formatTimeForEmail(t.end_time)}` : ''}`,
    `[ TASKS ]\n\n${bullets(t.tasks)}`,
    `[ MATERIALS ]\n\n${bullets(t.materials)}`,
    orgName || 'TradeDesk',
  ].join('\n\n');
  return { subject: `Job ticket - ${formatDateSlash(t.job_date)} - ${t.job_name}`, body };
}

export function mailtoLink(t: Ticket, recipient: string, orgName = ''): string {
  const { subject, body } = buildTicketEmail(t, orgName);
  return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function ticketDrawerHtmlSections(t: Ticket) {
  return [
    { heading: '[ JOB NAME ]', items: [t.job_name] },
    { heading: '[ DATE ]', items: [formatDateSlash(t.job_date)] },
    { heading: '[ NAMES ]', items: t.names.length ? t.names : ['—'] },
    {
      heading: '[ TIME ]',
      items: [
        t.start_time
          ? `${formatTimeForEmail(t.start_time)}${t.end_time ? ` - ${formatTimeForEmail(t.end_time)}` : ''}`
          : '—',
      ],
    },
    { heading: '[ TASKS ]', items: t.tasks.length ? t.tasks : ['—'] },
    { heading: '[ MATERIALS ]', items: t.materials.length ? t.materials : ['—'] },
  ];
}

export function filterTickets(tickets: Ticket[], filters: TicketFilters): Ticket[] {
  const search = filters.search.trim().toLowerCase();
  let list = tickets.filter((t) => {
    let matchesView: boolean;
    if (filters.view === 'drafts') {
      matchesView = !t.sent_at;
    } else if (filters.view === 'completed') {
      matchesView = Boolean(t.completed_at);
    } else {
      matchesView = Boolean(t.sent_at) && !t.completed_at;
    }
    if (!matchesView) return false;
    // All views honor the range; if no range is set they show everything.
    // Drafts filter by job date; sent/completed filter by when they were sent/completed.
    const stamp =
      filters.view === 'drafts'
        ? t.job_date
        : filters.view === 'completed'
          ? t.completed_at!.slice(0, 10)
          : t.sent_at!.slice(0, 10);
    if (filters.rangeStart && stamp < filters.rangeStart) return false;
    if (filters.rangeEnd && stamp > filters.rangeEnd) return false;
    if (!search) return true;
    return (
      t.job_name.toLowerCase().includes(search) ||
      t.names.join(' ').toLowerCase().includes(search) ||
      t.tasks.join(' ').toLowerCase().includes(search) ||
      t.materials.join(' ').toLowerCase().includes(search)
    );
  });

  const jobDate = (a: Ticket, b: Ticket) => a.job_date.localeCompare(b.job_date);
  const sorters: Record<string, (a: Ticket, b: Ticket) => number> = {
    'recent': (a, b) => b.created_at.localeCompare(a.created_at),
    'date-desc': (a, b) => jobDate(b, a),
    'date-asc': jobDate,
    'job-name': (a, b) => a.job_name.localeCompare(b.job_name),
    'status': (a, b) => {
      const aSent = a.sent_at ? 1 : 0;
      const bSent = b.sent_at ? 1 : 0;
      if (aSent !== bSent) return aSent - bSent;
      return b.created_at.localeCompare(a.created_at);
    },
  };
  list = [...list].sort(sorters[filters.sortKey] ?? sorters['recent']);
  return list;
}

export function groupByJobName(tickets: Ticket[]): { job: string; tickets: Ticket[] }[] {
  const map = new Map<string, Ticket[]>();
  for (const t of tickets) {
    const list = map.get(t.job_name) ?? [];
    list.push(t);
    map.set(t.job_name, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([job, ts]) => ({ job, tickets: ts }));
}
