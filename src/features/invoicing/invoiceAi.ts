import type { InvoiceDraftLine, Ticket } from '@/config/types';
import type { PriceMemory } from './priceBook';

export interface AiLineRequest {
  instruction: string;
  defaultRate: number;
  tickets: Pick<Ticket, 'job_name' | 'job_date' | 'start_time' | 'end_time' | 'names' | 'tasks' | 'materials'>[];
  /** The org's learned price book, so the AI reuses real past pricing. */
  priceHistory?: PriceMemory[];
}

type AiResult = { lines: InvoiceDraftLine[]; source: 'ai' | 'fallback' };

/**
 * Draft invoice lines via the invoice-ai edge function. Falls back to a local
 * heuristic draft when the AI key isn't configured (501) or the call fails.
 */
export async function generateAiLines(req: AiLineRequest): Promise<AiResult> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invoice-ai`;
  const headers = {
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        instruction: req.instruction,
        defaultRate: req.defaultRate,
        tickets: req.tickets,
        priceHistory: (req.priceHistory ?? []).slice(0, 60).map((m) => ({
          kind: m.kind,
          description: m.description,
          unit_price: m.unit_price,
          times_billed: m.usage_count,
        })),
      }),
    });
    if (res.status === 501) return fallback(req);
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    const body = (await res.json()) as { lines?: InvoiceDraftLine[] };
    if (!Array.isArray(body.lines) || body.lines.length === 0) throw new Error('Empty AI response');
    return { lines: body.lines, source: 'ai' };
  } catch {
    return fallback(req);
  }
}

function fallback(req: AiLineRequest): AiResult {
  const lines: InvoiceDraftLine[] = [];
  for (const t of req.tickets) {
    const time = t.start_time
      ? `${t.start_time}${t.end_time ? `-${t.end_time}` : ''}`
      : '';
    const ref = [
      t.job_date,
      time,
      t.names.length ? t.names.join(', ') : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const work = t.tasks.length > 0 ? t.tasks[0] : 'Completed work';
    lines.push({
      kind: 'labor',
      description: `Labor — ${work}`.slice(0, 300),
      ticket_ref: ref,
      ticket_id: null,
      quantity: 1,
      unit_price: req.defaultRate,
    });
    for (const m of t.materials.slice(0, 10)) {
      lines.push({
        kind: 'material',
        description: m,
        ticket_ref: t.job_date,
        ticket_id: null,
        quantity: 1,
        unit_price: 0,
      });
    }
  }
  return { lines, source: 'fallback' };
}
