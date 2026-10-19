import { useEffect, useState } from 'react';
import { Page, PageHeader } from '@/components/ui/Page';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, SkeletonList, ErrorState } from '@/components/ui/States';
import { useJobNames } from '@/features/shared/workspaceService';
import { useAuth } from '@/hooks/AuthContext';
import { fetchTickets } from '@/features/tickets/ticketsService';
import { JobReportModal, JobFormModal, type JobFormValues } from './JobModals';
import type { JobName, Ticket } from '@/config/types';
import { Briefcase, Eye, Pencil, Plus, Trash2 } from 'lucide-react';

interface JobsPageProps {
  orgId: string;
  orgName: string;
}

type ModalState =
  | { kind: 'none' }
  | { kind: 'addJob' }
  | { kind: 'editJob'; job: JobName }
  | { kind: 'report'; job: JobName };

export function JobsPage({ orgId }: JobsPageProps) {
  const { isAdmin } = useAuth();
  const { jobs, loading, error, addJob, deleteJob, updateJob, refresh } = useJobNames(orgId);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [savingJob, setSavingJob] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTickets(orgId)
      .then((t) => {
        if (!cancelled) setTickets(t);
      })
      .catch(() => {
        if (!cancelled) setTickets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const ticketCount = (job: string) => tickets.filter((t) => t.job_name === job).length;

  const saveJob = async (values: JobFormValues) => {
    setSavingJob(true);
    setActionError(null);
    const existing = jobs.find(
      (j) =>
        j.name.toLowerCase() === values.name.trim().toLowerCase() &&
        (modal.kind !== 'editJob' || modal.job.id !== j.id),
    );
    if (existing) {
      setActionError('That job name already exists.');
      setSavingJob(false);
      return;
    }
    const updates = {
      name: values.name.trim().slice(0, 120),
      client_name: values.client_name.trim().slice(0, 120),
      client_email: values.client_email.trim().slice(0, 160),
      client_phone: values.client_phone.trim().slice(0, 40),
      default_rate: Number(values.default_rate) || 0,
      notes: values.notes.trim().slice(0, 2000),
    };
    if (modal.kind === 'editJob') {
      await updateJob(modal.job.id, updates);
      setModal({ kind: 'none' });
    } else {
      const ok = await addJob(values.name, {
        client_name: updates.client_name,
        client_email: updates.client_email,
        client_phone: updates.client_phone,
        default_rate: updates.default_rate,
        notes: updates.notes,
      });
      if (ok) setModal({ kind: 'none' });
    }
    setSavingJob(false);
  };

  const reportJob = modal.kind === 'report' ? jobs.find((j) => j.id === modal.job.id) ?? modal.job : null;
  const reportTickets = reportJob
    ? tickets
        .filter((t) => t.job_name === reportJob.name)
        .sort((a, b) => b.job_date.localeCompare(a.job_date))
        .map((t) => ({
          id: t.id,
          job_date: t.job_date,
          names: t.names,
          status: (t.completed_at ? 'done' : t.sent_at ? 'sent' : 'draft') as 'draft' | 'sent' | 'done',
        }))
    : [];

  return (
    <Page>
      <PageHeader
        title="Jobs"
        description="Track every job and review its ticket history."
        actions={
          isAdmin && (
            <Button icon={<Plus size={16} />} onClick={() => setModal({ kind: 'addJob' })}>
              Add job
            </Button>
          )
        }
      />

      {actionError && (
        <div className="mb-3 rounded-lg border border-error-600/40 bg-error-600/10 px-3 py-2 text-xs text-error-400">
          {actionError}
        </div>
      )}

      {loading ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<Briefcase size={20} />}
          title="No jobs yet"
          description="Job names you add here become quick picks when creating tickets — and can be invoiced."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 animate-fade-up">
          {jobs.map((j) => (
            <div key={j.id} className="card px-4 py-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-100">{j.name}</p>
                  <p className="mt-0.5 text-2xs text-ink-400">
                    {ticketCount(j.name)} ticket{ticketCount(j.name) === 1 ? '' : 's'}
                    {j.client_name ? ` · ${j.client_name}` : ''}
                  </p>
                </div>
                <Badge tone={ticketCount(j.name) > 0 ? 'green' : 'neutral'}>{ticketCount(j.name)}</Badge>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-ink-700 pt-2.5">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Eye size={13} />}
                  onClick={() => setModal({ kind: 'report', job: j })}
                >
                  Report
                </Button>
                {isAdmin && (
                  <div className="flex items-center gap-0.5">
                    <Button size="sm" variant="ghost" onClick={() => setModal({ kind: 'editJob', job: j })} aria-label={`Edit ${j.name}`}>
                      <Pencil size={13} />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void deleteJob(j.id)} aria-label={`Delete ${j.name}`}>
                      <Trash2 size={13} className="text-ink-400" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.kind === 'addJob' && (
        <JobFormModal job={null} onClose={() => setModal({ kind: 'none' })} onSave={saveJob} saving={savingJob} error={actionError} />
      )}
      {modal.kind === 'editJob' && (
        <JobFormModal
          job={jobs.find((j) => j.id === modal.job.id) ?? modal.job}
          onClose={() => setModal({ kind: 'none' })}
          onSave={saveJob}
          saving={savingJob}
          error={actionError}
        />
      )}
      {modal.kind === 'report' && reportJob && (
        <JobReportModal
          job={reportJob}
          tickets={reportTickets}
          invoiceCount={0}
          onClose={() => setModal({ kind: 'none' })}
          onEdit={() => setModal({ kind: 'editJob', job: reportJob })}
        />
      )}
    </Page>
  );
}
