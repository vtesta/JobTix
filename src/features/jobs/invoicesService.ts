import { supabase } from '@/lib/supabase';
import type { Invoice, InvoiceDraftLine, InvoiceLineItem, InvoiceStatus, Ticket } from '@/config/types';

function formatDateSlash(value: string): string {
  const d = new Date(`${value}T12:00:00`);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

function formatTimeSlash(value: string): string {
  const [hh, mm] = value.split(':');
  const h = Number(hh);
  const suffix = h >= 12 ? 'p' : 'a';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${mm}${suffix}`;
}

export type InvoiceTab = 'all' | InvoiceStatus;

export async function fetchInvoices(orgId: string): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load invoices.');
  return (data ?? []) as Invoice[];
}

export async function fetchInvoiceLines(invoiceId: string): Promise<InvoiceLineItem[]> {
  const { data, error } = await supabase
    .from('invoice_line_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('sort_index', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error('Could not load invoice lines.');
  return (data ?? []) as InvoiceLineItem[];
}

async function insertLines(invoiceId: string, orgId: string, lines: InvoiceDraftLine[]): Promise<void> {
  if (lines.length === 0) return;
  const rows = lines.map((l, i) => ({
    invoice_id: invoiceId,
    organization_id: orgId,
    kind: l.kind,
    description: l.description,
    ticket_ref: l.ticket_ref,
    ticket_id: l.ticket_id ?? null,
    quantity: l.quantity,
    unit_price: l.unit_price,
    sort_index: i,
  }));
  const { error } = await supabase.from('invoice_line_items').insert(rows);
  if (error) throw new Error('Could not save invoice lines.');
}

export async function createInvoice(
  orgId: string,
  createdBy: string,
  header: {
    job_name: string;
    invoice_number: string;
    client_name: string;
    client_email: string;
    client_phone: string;
    issue_date: string;
    due_date: string | null;
    notes: string;
    tax_rate_pct: number;
    ticket_ids: string[];
  },
  lines: InvoiceDraftLine[],
): Promise<Invoice> {
  const { data, error } = await supabase
    .from('invoices')
    .insert({ ...header, organization_id: orgId, created_by: createdBy })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('That invoice number is already in use.');
    throw new Error('Could not create the invoice.');
  }
  const invoice = data as Invoice;
  await insertLines(invoice.id, orgId, lines);
  return invoice;
}

export async function updateInvoice(
  invoiceId: string,
  orgId: string,
  header: Partial<Invoice>,
  lines: InvoiceDraftLine[] | null,
): Promise<void> {
  const { error } = await supabase.from('invoices').update(header).eq('id', invoiceId);
  if (error) {
    if (error.code === '23505') throw new Error('That invoice number is already in use.');
    throw new Error('Could not update the invoice.');
  }
  if (lines) {
    const { error: delErr } = await supabase.from('invoice_line_items').delete().eq('invoice_id', invoiceId);
    if (delErr) throw new Error('Could not update invoice lines.');
    await insertLines(invoiceId, orgId, lines);
  }
}

export async function setInvoiceStatus(invoiceId: string, status: InvoiceStatus): Promise<void> {
  const patch: Partial<Invoice> = { status };
  if (status === 'sent') patch.sent_at = new Date().toISOString();
  if (status === 'paid') patch.paid_at = new Date().toISOString();
  if (status === 'draft') {
    patch.sent_at = null;
    patch.paid_at = null;
  }
  const { error } = await supabase.from('invoices').update(patch).eq('id', invoiceId);
  if (error) throw new Error('Could not update the invoice status.');
}

export async function deleteInvoice(invoiceId: string): Promise<void> {
  const { error } = await supabase.from('invoices').delete().eq('id', invoiceId);
  if (error) throw new Error('Could not delete the invoice.');
}

export function nextInvoiceNumber(existing: Invoice[]): string {
  let max = 0;
  for (const inv of existing) {
    const m = /^INV-(\d+)$/.exec(inv.invoice_number);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `INV-${String(max + 1).padStart(4, '0')}`;
}

/**
 * The most recent invoice for a job (any status except void) — used to learn
 * client details when the job record itself is missing them.
 */
export function latestInvoiceForJob(invoices: Invoice[], jobName: string): Invoice | undefined {
  return invoices
    .filter((inv) => inv.job_name === jobName && inv.status !== 'void')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

/**
 * Persist client info (and notes/tax rate) learned on an invoice back onto the
 * job record, so the next invoice for the same job prefills instantly.
 */
export async function saveClientInfoToJob(
  orgId: string,
  jobName: string,
  client: { client_name: string; client_email: string; client_phone: string; notes: string; tax_rate_pct: number },
): Promise<void> {
  const job = (await supabase.from('job_names').select('id, client_name, client_email, client_phone, notes, default_rate').eq('organization_id', orgId).eq('name', jobName).maybeSingle()).data as
    | { id: string; client_name: string; client_email: string; client_phone: string; notes: string; default_rate: number }
    | null;
  if (!job) return;
  const updates: Record<string, string> = {};
  if (!job.client_name && client.client_name) updates.client_name = client.client_name;
  if (!job.client_email && client.client_email) updates.client_email = client.client_email;
  if (!job.client_phone && client.client_phone) updates.client_phone = client.client_phone;
  if (!job.notes && client.notes) updates.notes = client.notes;
  if (Object.keys(updates).length === 0) return;
  const { error } = await supabase.from('job_names').update(updates).eq('id', job.id);
  if (error) throw new Error('Could not update the job with the client information.');
}

export function invoiceTotals(lines: InvoiceDraftLine[] | InvoiceLineItem[], taxRatePct: number) {
  const subtotal = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);
  const tax = subtotal * (taxRatePct / 100);
  return { subtotal, tax, total: subtotal + tax };
}

export function formatMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/**
 * Which invoice (if any) currently claims each ticket. A ticket can only be on
 * one live invoice: drafts claim loosely, sent/paid claims block re-billing.
 */
export type TicketBilling =
  | { state: 'none' }
  | { state: 'draft'; invoice: Invoice }
  | { state: 'billed'; invoice: Invoice };

export function buildBillingIndex(invoices: Invoice[]): Map<string, TicketBilling> {
  const index = new Map<string, TicketBilling>();
  for (const inv of invoices) {
    if (inv.status === 'void') continue;
    const entry: TicketBilling =
      inv.status === 'draft' ? { state: 'draft', invoice: inv } : { state: 'billed', invoice: inv };
    for (const id of inv.ticket_ids ?? []) index.set(id, entry);
  }
  return index;
}

/**
 * Remove the given tickets from any draft invoices that claim them (called when
 * they move to a new invoice, so a ticket never lives on two invoices).
 */
export async function releaseTicketsFromDrafts(
  orgId: string,
  invoices: Invoice[],
  ticketIds: string[],
  keepInvoiceId?: string,
): Promise<void> {
  const ids = new Set(ticketIds);
  const affected = invoices.filter(
    (inv) => inv.status === 'draft' && inv.id !== keepInvoiceId && (inv.ticket_ids ?? []).some((id) => ids.has(id)),
  );
  for (const inv of affected) {
    const remaining = (inv.ticket_ids ?? []).filter((id) => !ids.has(id));
    const { error } = await supabase.from('invoices').update({ ticket_ids: remaining }).eq('id', inv.id);
    if (error) throw new Error('Could not update the previous draft invoice.');
  }
}

/** Print-friendly invoice document (opens the browser print dialog). */
export function printInvoice(invoice: Invoice, lines: InvoiceLineItem[] | InvoiceDraftLine[], orgName: string): void {
  const { subtotal, tax, total } = invoiceTotals(lines, invoice.tax_rate_pct);
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const labor = lines.filter((l) => l.kind !== 'material');
  const materials = lines.filter((l) => l.kind === 'material');
  const byName = (a: InvoiceDraftLine | InvoiceLineItem, b: InvoiceDraftLine | InvoiceLineItem) =>
    a.description.localeCompare(b.description, undefined, { sensitivity: 'base' });
  labor.sort(byName);
  materials.sort(byName);
  const rowHtml = (l: InvoiceDraftLine | InvoiceLineItem) => `<tr>
        <td>${esc(l.description)}${l.ticket_ref ? `<span class="ref">Ticket: ${esc(l.ticket_ref)}</span>` : ''}</td>
        <td class="num">${esc(l.kind === 'labor' ? `${l.quantity} hr` : String(l.quantity))}</td>
        <td class="num">${esc(formatMoney(Number(l.unit_price) || 0))}</td>
        <td class="num">${esc(formatMoney((Number(l.quantity) || 0) * (Number(l.unit_price) || 0)))}</td>
      </tr>`;
  const section = (label: string, items: Array<InvoiceDraftLine | InvoiceLineItem>) => {
    if (items.length === 0) return '';
    const sub = items.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);
    return `<tr class="section"><td colspan="4"><span>${label}</span><span class="sectotal">${esc(formatMoney(sub))}</span></td></tr>${items.map(rowHtml).join('')}`;
  };
  const bodyHtml = section('Labor', labor) + section('Materials', materials);
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(invoice.invoice_number)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; margin: 48px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a1a1a; padding-bottom: 16px; }
  .org { font-size: 20px; font-weight: bold; letter-spacing: 0.05em; text-transform: uppercase; }
  .inv-no { font-size: 26px; font-weight: bold; text-align: right; }
  .meta { text-align: right; font-size: 13px; color: #444; margin-top: 4px; }
  .parties { display: flex; justify-content: space-between; margin: 28px 0; font-size: 14px; }
  .label { font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: #777; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; border-bottom: 2px solid #1a1a1a; padding: 8px 6px; }
  th.num, td.num { text-align: right; }
  td { padding: 10px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
  .ref { display: block; font-size: 11px; color: #888; margin-top: 2px; }
  tr.section td { background: #f4f4f2; border-top: 2px solid #1a1a1a; border-bottom: 1px solid #ccc; padding: 6px; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: bold; color: #333; }
  tr.section .sectotal { float: right; letter-spacing: 0; text-transform: none; font-size: 12px; }
  .totals { margin-top: 20px; margin-left: auto; width: 260px; font-size: 14px; }
  .totals td { border: none; padding: 4px 6px; }
  .totals .grand td { border-top: 2px solid #1a1a1a; font-weight: bold; font-size: 16px; }
  .notes { margin-top: 32px; font-size: 13px; color: #444; white-space: pre-wrap; }
  @media print { body { margin: 24px; } }
</style>
</head>
<body>
  <div class="head">
    <div>
      <div class="org">${esc(orgName || 'TradeDesk')}</div>
      ${invoice.client_name ? `<div style="margin-top:18px"><div class="label">Billed to</div>${esc(invoice.client_name)}${invoice.client_email ? `<br>${esc(invoice.client_email)}` : ''}${invoice.client_phone ? `<br>${esc(invoice.client_phone)}` : ''}</div>` : ''}
    </div>
    <div>
      <div class="inv-no">${esc(invoice.invoice_number)}</div>
      <div class="meta">
        Issued ${esc(invoice.issue_date)}<br>
        ${invoice.due_date ? `Due ${esc(invoice.due_date)}<br>` : ''}
        Job: ${esc(invoice.job_name)}<br>
        Status: ${esc(invoice.status)}
      </div>
    </div>
  </div>
  <table>
    <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
    <tbody>${bodyHtml}</tbody>
  </table>
  <table class="totals">
    <tr><td>Subtotal</td><td class="num">${esc(formatMoney(subtotal))}</td></tr>
    <tr><td>Tax (${esc(String(invoice.tax_rate_pct))}%)</td><td class="num">${esc(formatMoney(tax))}</td></tr>
    <tr class="grand"><td>Total</td><td class="num">${esc(formatMoney(total))}</td></tr>
  </table>
  ${invoice.notes ? `<div class="notes"><span class="label">Notes</span><br>${esc(invoice.notes)}</div>` : ''}
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`;
  const win = window.open('', '_blank', 'noopener,noreferrer');
  if (!win) throw new Error('Allow pop-ups to print the invoice.');
  win.document.write(html);
  win.document.close();
}
