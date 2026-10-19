import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatDate, formatDateTime } from '@/lib/format';
import type { Invoice } from '@/config/types';
import { Trash2 } from 'lucide-react';

const statusTone: Record<Invoice['status'], 'green' | 'warning' | 'neutral' | 'error'> = {
  draft: 'neutral',
  sent: 'warning',
  paid: 'green',
  void: 'error',
};

interface InvoiceDetailModalProps {
  invoice: Invoice;
  lines: { kind: string; description: string; ticket_ref: string; quantity: number; unit_price: number }[];
  orgName: string;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: () => void;
  onPrint: () => void;
  onSetStatus: (status: Invoice['status']) => void;
  onDelete: () => void;
}

export function InvoiceDetailModal({ invoice, lines, orgName, isAdmin, onClose, onEdit, onPrint, onSetStatus, onDelete }: InvoiceDetailModalProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);
  const tax = subtotal * (Number(invoice.tax_rate_pct) / 100);
  return (
    <Modal
      open
      onClose={onClose}
      title={invoice.invoice_number}
      description={`${invoice.job_name} · ${formatDate(invoice.issue_date)}`}
      width="md"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div>
            {isAdmin && !confirmDelete ? (
              <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            ) : null}
            {confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-300">Delete this invoice?</span>
                <Button size="sm" variant="danger" onClick={onDelete}>Yes, delete</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>No</Button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin && invoice.status === 'draft' && (
              <Button variant="secondary" onClick={() => onSetStatus('sent')}>Mark sent</Button>
            )}
            {isAdmin && invoice.status === 'sent' && (
              <Button variant="primary" onClick={() => onSetStatus('paid')}>Mark paid</Button>
            )}
            {isAdmin && invoice.status !== 'void' && invoice.status !== 'draft' && (
              <Button variant="ghost" onClick={() => onSetStatus('draft')}>Back to draft</Button>
            )}
            <Button variant="secondary" onClick={onPrint}>Print</Button>
            {isAdmin && <Button onClick={onEdit}>Edit</Button>}
          </div>
        </div>
      }
    >
      <div className="mb-3 flex items-center gap-2">
        <Badge tone={statusTone[invoice.status]}>{invoice.status.toUpperCase()}</Badge>
        {invoice.sent_at && <span className="text-2xs text-ink-400">Sent {formatDateTime(invoice.sent_at)}</span>}
        {invoice.paid_at && <span className="text-2xs text-ink-400">Paid {formatDateTime(invoice.paid_at)}</span>}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm">
          <p className="text-2xs font-bold uppercase tracking-wider text-ink-400">Billed to</p>
          {invoice.client_name ? (
            <div className="mt-1 text-ink-200">
              <p>{invoice.client_name}</p>
              {invoice.client_email && <p className="text-xs text-ink-300">{invoice.client_email}</p>}
              {invoice.client_phone && <p className="text-xs text-ink-300">{invoice.client_phone}</p>}
            </div>
          ) : (
            <p className="mt-1 text-xs text-ink-400">No client on this invoice.</p>
          )}
        </div>
        <div className="rounded-xl border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm">
          <p className="text-2xs font-bold uppercase tracking-wider text-ink-400">Details</p>
          <div className="mt-1 space-y-0.5 text-xs text-ink-300">
            <p>Job: {invoice.job_name}</p>
            <p>Issued: {formatDate(invoice.issue_date)}</p>
            {invoice.due_date && <p>Due: {formatDate(invoice.due_date)}</p>}
            <p>{invoice.ticket_ids.length} ticket{invoice.ticket_ids.length === 1 ? '' : 's'} combined</p>
            <p>From {orgName}</p>
          </div>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-ink-700">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-ink-800 text-left text-2xs uppercase tracking-wider text-ink-400">
              <th className="px-3 py-2 font-semibold">Description</th>
              <th className="px-2 py-2 text-right font-semibold">Qty</th>
              <th className="px-2 py-2 text-right font-semibold">Rate</th>
              <th className="px-3 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            <LineRows label="Labor" kind="labor" lines={lines} />
            <LineRows label="Materials" kind="material" lines={lines} />
          </tbody>
        </table>
      </div>

      <div className="mt-3 ml-auto w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between text-ink-300"><span>Subtotal</span><span className="tabular-nums">${subtotal.toFixed(2)}</span></div>
        <div className="flex justify-between text-ink-300"><span>Tax ({invoice.tax_rate_pct}%)</span><span className="tabular-nums">${tax.toFixed(2)}</span></div>
        <div className="flex justify-between border-t border-ink-700 pt-1.5 font-display text-base font-bold text-ink-50">
          <span>Total</span><span className="tabular-nums">${(subtotal + tax).toFixed(2)}</span>
        </div>
      </div>

      {invoice.notes && (
        <div className="mt-3 rounded-xl border border-ink-700 bg-ink-900 px-3 py-2.5">
          <p className="text-2xs font-bold uppercase tracking-wider text-ink-400">Notes</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-ink-300">{invoice.notes}</p>
        </div>
      )}
      {isAdmin && <p className="mt-2 text-2xs text-ink-500">Created by {invoice.created_by || '—'}</p>}
    </Modal>
  );
}

/** Section of the invoice table: a kind banner with subtotal, then its rows. */
function LineRows({
  label,
  kind,
  lines,
}: {
  label: string;
  kind: string;
  lines: { kind: string; description: string; ticket_ref: string; quantity: number; unit_price: number }[];
}) {
  const section = lines
    .filter((l) => l.kind === kind)
    .sort((a, b) => a.description.localeCompare(b.description, undefined, { sensitivity: 'base' }));
  if (section.length === 0) return null;
  const sectionSubtotal = section.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);
  return (
    <>
      <tr className="bg-ink-800/80">
        <td colSpan={4} className="px-3 py-1.5">
          <span className="flex items-center justify-between text-2xs font-bold uppercase tracking-wider text-green-400">
            {label}
            <span className="tabular-nums text-ink-300">{sectionSubtotal.toFixed(2)} USD</span>
          </span>
        </td>
      </tr>
      {section.map((l, i) => (
        <tr key={i} className={i % 2 === 0 ? 'bg-ink-900' : 'bg-ink-900/60'}>
          <td className="px-3 py-2 text-ink-200">
            {l.description}
            {l.ticket_ref && <span className="block text-2xs text-ink-500">Ticket: {l.ticket_ref}</span>}
          </td>
          <td className="px-2 py-2 text-right tabular-nums text-ink-300">{l.quantity}</td>
          <td className="px-2 py-2 text-right tabular-nums text-ink-300">${Number(l.unit_price).toFixed(2)}</td>
          <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink-100">
            ${((Number(l.quantity) || 0) * (Number(l.unit_price) || 0)).toFixed(2)}
          </td>
        </tr>
      ))}
    </>
  );
}
