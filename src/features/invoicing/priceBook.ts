import { supabase } from '@/lib/supabase';
import type { InvoiceDraftLine } from '@/config/types';

/** A learned line item: what this org actually billed for something before. */
export interface PriceMemory {
  kind: 'labor' | 'material';
  description: string;
  unit_price: number;
  quantity: number;
  usage_count: number;
  last_used_at: string;
}

/** Match a ticket/task description against memory, ignoring case and punctuation. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

const db = (): PriceMemory[] => memories;

let memories: PriceMemory[] = [];

/** Load the org's price book (top 200 most recently/frequently used items). */
export async function loadPriceMemories(orgId: string): Promise<PriceMemory[]> {
  const { data, error } = await supabase
    .from('invoice_memories')
    .select('kind, description, unit_price, quantity, usage_count, last_used_at')
    .eq('organization_id', orgId)
    .order('last_used_at', { ascending: false })
    .limit(200);
  if (error) {
    memories = [];
    return memories;
  }
  memories = (data ?? []).map((row) => ({
    kind: row.kind === 'material' ? 'material' : 'labor',
    description: String(row.description),
    unit_price: Number(row.unit_price),
    quantity: Number(row.quantity),
    usage_count: Number(row.usage_count),
    last_used_at: String(row.last_used_at),
  }));
  return memories;
}

/** Local mirror of the price book for synchronous lookups in the UI. */
export function getCachedMemories(): PriceMemory[] {
  return memories;
}

/**
 * Find the best learned price for a draft line. Exact normalized match first,
 * then substring containment (a task "Install 6 recessed lights" matches a
 * memory "Install recessed lights" in either direction). Prefers the same
 * line kind, higher usage, and more recent use.
 */
export function findLearnedPrice(
  kind: 'labor' | 'material',
  description: string,
): PriceMemory | null {
  const pool = memories.filter((m) => m.kind === kind);
  if (pool.length === 0) return null;
  const target = normalize(description);
  if (!target) return null;

  let best: PriceMemory | null = null;
  let bestScore = 0;
  for (const m of pool) {
    const norm = normalize(m.description);
    if (!norm) continue;
    let score = 0;
    if (norm === target) score = 100;
    else if (norm.includes(target) || target.includes(norm)) {
      score = 60 - Math.abs(norm.length - target.length) * 0.5;
    }
    if (score <= 0) continue;
    score += Math.min(m.usage_count, 10) + (m.kind === kind ? 5 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/**
 * Remember what an invoice actually used. Called after a successful save —
 * one upsert per distinct (kind, description) so repeated lines don't inflate
 * usage counts.
 */
export async function recordInvoiceLines(
  orgId: string,
  lines: InvoiceDraftLine[],
): Promise<void> {
  const seen = new Set<string>();
  const calls = [];
  for (const l of lines) {
    const description = (l.description || '').trim();
    if (!description || description === '—') continue;
    if (l.kind === 'labor' && !(Number(l.unit_price) > 0)) continue;
    const key = `${l.kind}|${normalize(description)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    calls.push(
      supabase.rpc('upsert_invoice_memory', {
        p_org: orgId,
        p_kind: l.kind,
        p_description: description.slice(0, 300),
        p_unit_price: Math.max(0, Number(l.unit_price) || 0),
        p_quantity: Math.max(0, Number(l.quantity) || 1),
      }),
    );
  }
  if (calls.length === 0) return;
  const results = await Promise.allSettled(calls);
  // Record failures are silent: memory is a convenience, never a blocker.
  if (results.some((r) => r.status === 'fulfilled' && !r.value.error)) {
    await loadPriceMemories(orgId);
  }
}

/** Suggestion chips: the org's most-used items, best first. */
export function getSuggestions(limit = 6): PriceMemory[] {
  const list = db().slice();
  list.sort(
    (a, b) =>
      b.usage_count - a.usage_count ||
      b.last_used_at.localeCompare(a.last_used_at),
  );
  return list.slice(0, limit);
}
