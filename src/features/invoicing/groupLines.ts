import type { InvoiceDraftLine, Ticket } from '@/config/types';
import { formatDateShort } from '@/lib/format';
import { findLearnedPrice } from './priceBook';

export type LineKind = 'labor' | 'material';

/**
 * A grouped invoice line: one priced item that may absorb the same work from
 * many tickets. ticketIds/refs track exactly which tickets feed this line.
 */
export interface GroupLine {
  id: string;
  kind: LineKind;
  description: string;
  unit_price: number;
  quantity: number;
  ticketIds: string[];
  ticketRefs: string[];
  learnedPrice: boolean;
}

export interface IngestStats {
  tickets: number;
  added: number;
  absorbed: number;
}

let counter = 0;
export function nextGroupId(): string {
  counter += 1;
  return `g${Date.now().toString(36)}-${counter}`;
}

export function normalizeKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

export function shortTicketRef(t: Ticket): string {
  return `${formatDateShort(t.job_date)}${t.start_time ? ` · ${t.start_time}` : ''}`;
}

/**
 * If the price book knows this exact item, adopt its canonical wording so
 * differently-phrased tickets group together across batches.
 */
function canonicalDescription(kind: LineKind, description: string): string {
  const learned = findLearnedPrice(kind, description);
  if (learned && normalizeKey(learned.description) === normalizeKey(description)) {
    return learned.description;
  }
  return description;
}

function priceFor(kind: LineKind, description: string, defaultLaborRate: number): { unit_price: number; learnedPrice: boolean } {
  const learned = findLearnedPrice(kind, description);
  if (learned) return { unit_price: learned.unit_price, learnedPrice: true };
  return { unit_price: kind === 'labor' ? defaultLaborRate : 0, learnedPrice: false };
}

/**
 * Batch ingest: pull every task and material from the given tickets into
 * grouped lines. Items with the same normalized description merge into one
 * line — the ticket is recorded and the quantity bumped instead of adding a
 * duplicate row.
 */
export function ingestTickets(
  tickets: Ticket[],
  existing: GroupLine[],
  opts: { defaultLaborRate: number },
): { groups: GroupLine[]; stats: IngestStats } {
  const groups = existing.map((g) => ({ ...g, ticketIds: [...g.ticketIds], ticketRefs: [...g.ticketRefs] }));
  const byKey = new Map<string, GroupLine>();
  for (const g of groups) byKey.set(`${g.kind}|${normalizeKey(g.description)}`, g);
  const stats: IngestStats = { tickets: tickets.length, added: 0, absorbed: 0 };

  for (const t of tickets) {
    const ref = shortTicketRef(t);
    const items: Array<{ kind: LineKind; content: string }> = [
      ...t.tasks.map((c) => ({ kind: 'labor' as const, content: c })),
      ...t.materials.map((c) => ({ kind: 'material' as const, content: c })),
    ];
    for (const { kind, content } of items) {
      const raw = content.trim().slice(0, 300);
      if (!raw) continue;
      const description = canonicalDescription(kind, raw);
      const key = `${kind}|${normalizeKey(description)}`;
      const hit = byKey.get(key);
      if (hit) {
        hit.ticketIds.push(t.id);
        hit.ticketRefs.push(ref);
        hit.quantity += 1;
        stats.absorbed += 1;
        continue;
      }
      const price = priceFor(kind, description, opts.defaultLaborRate);
      const group: GroupLine = {
        id: nextGroupId(),
        kind,
        description,
        unit_price: price.unit_price,
        quantity: 1,
        ticketIds: [t.id],
        ticketRefs: [ref],
        learnedPrice: price.learnedPrice,
      };
      groups.push(group);
      byKey.set(key, group);
      stats.added += 1;
    }
  }
  return { groups, stats };
}

/** Absorb ungrouped draft lines (AI drafts, suggestions, edits) into groups. */
export function absorbDraftLines(existing: GroupLine[], drafts: InvoiceDraftLine[]): GroupLine[] {
  const groups = existing.map((g) => ({ ...g, ticketIds: [...g.ticketIds], ticketRefs: [...g.ticketRefs] }));
  const byKey = new Map<string, GroupLine>();
  for (const g of groups) byKey.set(`${g.kind}|${normalizeKey(g.description)}`, g);

  for (const d of drafts) {
    const raw = (d.description || '').trim().slice(0, 300);
    if (!raw) continue;
    const kind: LineKind = d.kind === 'material' ? 'material' : 'labor';
    const description = canonicalDescription(kind, raw);
    const key = `${kind}|${normalizeKey(description)}`;
    const hit = byKey.get(key);
    if (hit) {
      if (d.ticket_id) hit.ticketIds.push(d.ticket_id);
      if (d.ticket_ref) hit.ticketRefs.push(d.ticket_ref);
      hit.quantity += Number(d.quantity) || 1;
      continue;
    }
    const group: GroupLine = {
      id: nextGroupId(),
      kind,
      description,
      unit_price: Number(d.unit_price) || 0,
      quantity: Number(d.quantity) || 1,
      ticketIds: d.ticket_id ? [d.ticket_id] : [],
      ticketRefs: d.ticket_ref ? [d.ticket_ref] : [],
      learnedPrice: false,
    };
    groups.push(group);
    byKey.set(key, group);
  }
  return groups;
}

export function updateGroup(groups: GroupLine[], id: string, patch: Partial<GroupLine>): GroupLine[] {
  return groups.map((g) => (g.id === id ? { ...g, ...patch } : g));
}

export function removeTicketFromGroup(groups: GroupLine[], id: string, refIndex: number): GroupLine[] {
  return groups
    .map((g) => {
      if (g.id !== id) return g;
      const ticketIds = g.ticketIds.filter((_, i) => i !== refIndex);
      const ticketRefs = g.ticketRefs.filter((_, i) => i !== refIndex);
      return { ...g, ticketIds, ticketRefs, quantity: Math.max(1, g.quantity - 1) };
    })
    .filter((g) => g.ticketRefs.length > 0 || g.ticketIds.length === 0);
}

/** Compact ref note for the saved line: keeps the invoice readable. */
export function summarizeRefs(refs: string[]): string {
  if (refs.length === 0) return '';
  if (refs.length <= 2) return refs.join(' · ');
  return `${refs[0]} +${refs.length - 1} more`;
}

/** Persisted order: all labor lines first, then materials, each alphabetical. */
export function sortGroups(groups: GroupLine[]): GroupLine[] {
  const kindRank = (k: LineKind) => (k === 'labor' ? 0 : 1);
  return [...groups].sort(
    (a, b) =>
      kindRank(a.kind) - kindRank(b.kind) ||
      a.description.localeCompare(b.description, undefined, { sensitivity: 'base' }),
  );
}

export function toDraftLines(groups: GroupLine[]): InvoiceDraftLine[] {
  return sortGroups(groups).map((g) => ({
    kind: g.kind,
    description: g.description,
    ticket_ref: summarizeRefs(g.ticketRefs),
    ticket_id: g.ticketIds[0] ?? null,
    quantity: g.quantity,
    unit_price: g.unit_price,
  }));
}
