import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/States';
import { formatDate, formatDateTime, sanitizeText, isEmail } from '@/lib/format';
import { useAuth } from '@/hooks/AuthContext';
import type { Invoice, JobName } from '@/config/types';
import { Trash2 } from 'lucide-react';

interface JobReportModalProps {
  job: JobName;
  tickets: { id: string; job_date: string; names: string[]; status: 'draft' | 'sent' | 'done' }[];
  invoiceCount: number;
  onClose: () => void;
  onEdit: () => void;
}

export function JobReportModal({ job, tickets, invoiceCount, onClose, onEdit }: JobReportModalProps) {
  return (
    <Modal
      open
      onClose={onClose}
      title={job.name}
      description="Job report"
      width="md"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={onEdit}>Edit job</Button>
        </div>
      }
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <StatCard label="Tickets" value={String(tickets.length)} />
        <StatCard label="Completed" value={String(tickets.filter((t) => t.status === 'done').length)} />
        <StatCard label="Invoices" value={String(invoiceCount)} />
      </div>

      <div className="mt-3 rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-sm">
        <p className="text-2xs font-bold uppercase tracking-wider text-ink-400">Client</p>
        {job.client_name || job.client_email || job.client_phone ? (
          <div className="mt-1.5 space-y-0.5 text-ink-200">
            {job.client_name && <p>{job.client_name}</p>}
            {job.client_email && <p className="text-xs text-ink-300">{job.client_email}</p>}
            {job.client_phone && <p className="text-xs text-ink-300">{job.client_phone}</p>}
          </div>
        ) : (
          <p className="mt-1 text-xs text-ink-400">No client details yet — add them when you edit the job.</p>
        )}
        {Number(job.default_rate) > 0 && (
          <p className="mt-2 text-xs text-ink-300">
            Default rate: <span className="font-semibold text-ink-100">${Number(job.default_rate).toFixed(2)}/hr</span>
          </p>
        )}
        {job.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-ink-300">{job.notes}</p>}
      </div>

      <div className="mt-3">
        <p className="mb-1.5 text-2xs font-bold uppercase tracking-wider text-ink-400">Ticket history</p>
        {tickets.length === 0 ? (
          <p className="rounded-lg border border-dashed border-ink-700 px-3 py-4 text-center text-xs text-ink-400">
            No tickets reference this job yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-ink-700">
            {tickets.map((t, i) => (
              <div
                key={t.id}
                className={`flex items-center justify-between gap-2 px-3 py-2 text-xs ${i % 2 === 0 ? 'bg-ink-900' : 'bg-ink-900/60'}`}
              >
                <span className="text-ink-200">{formatDate(t.job_date)}</span>
                <span className="min-w-0 flex-1 truncate px-2 text-ink-400">{t.names.join(', ') || '—'}</span>
                <Badge tone={t.status === 'done' ? 'green' : t.status === 'sent' ? 'warning' : 'neutral'}>
                  {t.status === 'done' ? 'Done' : t.status === 'sent' ? 'Sent' : 'Draft'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 px-3 py-2.5 text-center">
      <p className="font-display text-lg font-bold text-ink-50">{value}</p>
      <p className="text-2xs uppercase tracking-wider text-ink-400">{label}</p>
    </div>
  );
}

interface JobFormModalProps {
  job: JobName | null;
  onClose: () => void;
  onSave: (values: JobFormValues) => Promise<unknown>;
  saving: boolean;
  error: string | null;
}

export interface JobFormValues {
  name: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  default_rate: string;
  notes: string;
}

export function JobFormModal({ job, onClose, onSave, saving, error }: JobFormModalProps) {
  const [values, setValues] = useState<JobFormValues>(() => ({
    name: job?.name ?? '',
    client_name: job?.client_name ?? '',
    client_email: job?.client_email ?? '',
    client_phone: job?.client_phone ?? '',
    default_rate: job ? String(Number(job.default_rate) || '') : '',
    notes: job?.notes ?? '',
  }));
  const [localError, setLocalError] = useState<string | null>(null);

  const set = (patch: Partial<JobFormValues>) => setValues((v) => ({ ...v, ...patch }));

  const submit = async () => {
    if (!sanitizeText(values.name, 120)) {
      setLocalError('Job name is required.');
      return;
    }
    if (values.client_email && !isEmail(values.client_email)) {
      setLocalError('Client email is not a valid address.');
      return;
    }
    const rate = Number(values.default_rate);
    if (values.default_rate && (Number.isNaN(rate) || rate < 0)) {
      setLocalError('Default rate must be a positive number.');
      return;
    }
    setLocalError(null);
    await onSave(values);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={job ? 'Edit job' : 'Add job'}
      description={job ? 'Update the job details used on tickets and invoices.' : 'Give the job a clear, recognizable name.'}
      width="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={submit}>{job ? 'Save changes' : 'Add job'}</Button>
        </div>
      }
    >
      <div className="space-y-3">
        {(localError || error) && (
          <div className="rounded-lg border border-error-600/40 bg-error-600/10 px-3 py-2 text-xs text-error-400">
            {localError ?? error}
          </div>
        )}
        <Input label="Job name" value={values.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} placeholder="e.g. Maple St. remodel" />
        <Input label="Client name" value={values.client_name} onChange={(e) => set({ client_name: e.target.value })} maxLength={120} placeholder="Optional" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Client email" type="email" value={values.client_email} onChange={(e) => set({ client_email: e.target.value })} maxLength={160} />
          <Input label="Client phone" value={values.client_phone} onChange={(e) => set({ client_phone: e.target.value })} maxLength={40} />
        </div>
        <Input
          label="Default hourly rate ($)"
          type="number"
          min={0}
          step="0.5"
          value={values.default_rate}
          onChange={(e) => set({ default_rate: e.target.value })}
          placeholder="Used when drafting invoices"
        />
        <Input label="Notes" value={values.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={2000} placeholder="Optional job notes" />
      </div>
    </Modal>
  );
}
