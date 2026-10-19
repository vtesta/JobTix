import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/AuthContext';
import { formatDate } from '@/lib/format';
import { EmptyState, SkeletonDispatchDay } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Page, PageHeader } from '@/components/ui/Page';
import { useToast } from '@/components/ui/Toast';
import { TicketForm, type TicketDraft } from '@/features/tickets/TicketForm';
import { useEmployees, useJobNames } from '@/features/shared/workspaceService';
import { createTicket, fetchTickets, syncTicketItems } from '@/features/tickets/ticketsService';
import type { Ticket } from '@/config/types';
import {
  acknowledgeAssignment,
  ensureJobName,
  fetchMyAssignments,
  type DispatchJob,
  type JobAssignment,
} from './dispatchService';
import { CalendarDays, CheckCheck, ChevronRight, ClipboardList, Clock, HardHat, MapPin } from 'lucide-react';

type MyAssignment = JobAssignment & { job: DispatchJob };

function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function MyJobsPage({ orgId }: { orgId: string }) {
  const { user, currentMembership } = useAuth();
  const { toast } = useToast();
  const { jobs, addJob } = useJobNames(orgId);
  const { employees } = useEmployees(orgId);
  const [assignments, setAssignments] = useState<MyAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketJob, setTicketJob] = useState<DispatchJob | null>(null);
  const [confirmJob, setConfirmJob] = useState<DispatchJob | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMyAssignments(orgId)
      .then((rows) => {
        if (!cancelled) {
          setAssignments(rows.filter((a) => Boolean(a.job)));
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load your jobs.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, user?.id]);

  useEffect(() => {
    let cancelled = false;
    fetchTickets(orgId)
      .then((rows) => {
        if (!cancelled) setTickets(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const groups = useMemo(() => {
    const today = todayIso();
    const sorted = [...assignments].sort((a, b) => a.job.job_date.localeCompare(b.job.job_date));
    return {
      today: sorted.filter((a) => a.job.job_date === today),
      upcoming: sorted.filter((a) => a.job.job_date > today && a.status === 'assigned'),
      past: sorted.filter((a) => a.job.job_date < today || (a.job.job_date === today && a.status === 'acknowledged')),
    };
  }, [assignments]);

  const acknowledge = async (a: MyAssignment) => {
    setAssignments((rows) =>
      rows.map((r) =>
        r.id === a.id
          ? { ...r, status: 'acknowledged' as const, acknowledged_at: new Date().toISOString() }
          : r,
      ),
    );
    try {
      await acknowledgeAssignment(a.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the assignment.');
      setAssignments((rows) =>
        rows.map((r) => (r.id === a.id ? { ...r, status: 'assigned' as const, acknowledged_at: null } : r)),
      );
    }
  };

  const hasTicketForJob = (job: DispatchJob) =>
    tickets.some(
      (t) =>
        t.job_name.trim().toLowerCase() === job.name.trim().toLowerCase() &&
        t.job_date === job.job_date,
    );

  const startTicket = (job: DispatchJob) => {
    if (hasTicketForJob(job)) setConfirmJob(job);
    else setTicketJob(job);
  };

  const saveTicket = async (draft: TicketDraft, submit: boolean) => {
    const created = await createTicket({ ...draft, organization_id: orgId });
    await syncTicketItems(created.id, draft.tasks, draft.materials, orgId);
    void ensureJobName(orgId, draft.job_name);
    setTickets((prev) => [created, ...prev]);
    toast(submit ? 'Ticket submitted.' : 'Ticket saved as a draft.');
  };

  return (
    <Page>
      <PageHeader
        title="My Jobs"
        description="Where you're scheduled each day."
      />

      {error && (
        <p className="mb-3 rounded-lg border border-error-600/40 bg-error-600/10 px-3 py-2 text-xs text-error-400">
          {error}
        </p>
      )}

      {!loading && groups.today.length > 0 && (
        <div className="mb-4 space-y-2">
          {groups.today.map((a) => {
            const duplicate = hasTicketForJob(a.job);
            return (
              <button
                key={`active-${a.id}`}
                type="button"
                onClick={() => startTicket(a.job)}
                className="flex w-full items-center gap-3 rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-left transition-colors hover:bg-green-500/15"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-500/15 text-green-300">
                  <ClipboardList size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-green-300">
                    Active job today: {a.job.name}
                  </span>
                  <span className="block text-2xs text-green-200/70">
                    {duplicate
                      ? 'A ticket already exists for this job today — tap to add another'
                      : 'Tap to open a ticket — the details are filled in for you'}
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-green-300" />
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <SkeletonDispatchDay rows={4} />
      ) : assignments.length === 0 ? (
        <EmptyState
          icon={<HardHat size={20} />}
          title="No jobs assigned"
          description="When your dispatcher assigns you a job, it shows up here."
        />
      ) : (
        <div className="space-y-6">
          <AssignmentSection
            heading={groups.today.length > 0 ? `Today (${groups.today.length})` : undefined}
            assignments={groups.today}
            onAcknowledge={acknowledge}
          />
          <AssignmentSection
            heading={groups.upcoming.length > 0 ? `Upcoming (${groups.upcoming.length})` : undefined}
            assignments={groups.upcoming}
            onAcknowledge={acknowledge}
          />
          <AssignmentSection
            heading={groups.past.length > 0 ? `Earlier / reviewed (${groups.past.length})` : undefined}
            assignments={groups.past}
          />
        </div>
      )}

      {ticketJob && (
        <TicketForm
          open
          onClose={() => setTicketJob(null)}
          onSave={saveTicket}
          jobs={jobs}
          employees={employees}
          allowNewJob
          onAddJob={(name) => addJob(name)}
          initial={{
            job_name: ticketJob.name,
            job_date: ticketJob.job_date,
            names: currentMembership?.name ? [currentMembership.name] : [],
            start_time: ticketJob.start_time ?? '',
            end_time: '',
            tasks: [...ticketJob.tasks],
            materials: [...ticketJob.materials],
            created_by: currentMembership?.name ?? '',
          }}
          defaultCreatedBy={currentMembership?.name ?? ''}
        />
      )}

      {confirmJob && (
        <Modal
          open
          onClose={() => setConfirmJob(null)}
          title="Duplicate ticket?"
          width="sm"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmJob(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setTicketJob(confirmJob);
                  setConfirmJob(null);
                }}
              >
                Create anyway
              </Button>
            </div>
          }
        >
          <p className="text-sm text-ink-200">
            A ticket for <span className="font-bold">{confirmJob.name}</span> on{' '}
            {formatDate(confirmJob.job_date)} already exists. Are you sure you want to create a
            duplicate ticket?
          </p>
        </Modal>
      )}
    </Page>
  );
}

function AssignmentSection({
  heading,
  assignments,
  onAcknowledge,
}: {
  heading?: string;
  assignments: MyAssignment[];
  onAcknowledge?: (a: MyAssignment) => void;
}) {
  if (assignments.length === 0) return null;
  return (
    <div>
      {heading && (
        <p className="mb-2 text-2xs font-bold uppercase tracking-wider text-ink-400">{heading}</p>
      )}
      <div className="space-y-2">
        {assignments.map((a) => (
          <AssignmentCard key={a.id} assignment={a} onAcknowledge={onAcknowledge} />
        ))}
      </div>
    </div>
  );
}

function AssignmentCard({
  assignment,
  onAcknowledge,
}: {
  assignment: MyAssignment;
  onAcknowledge?: (a: MyAssignment) => void;
}) {
  const job = assignment.job;
  const ack = assignment.status === 'acknowledged';
  const isToday = job.job_date === todayIso();
  return (
    <div className={`card p-4 transition-colors ${ack ? 'opacity-75' : isToday ? 'border-green-500/30' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {job.start_time && (
              <span className="rounded-md bg-ink-800 px-2 py-0.5 text-2xs font-bold tabular-nums text-green-300">
                {job.start_time}
              </span>
            )}
            <p className="truncate text-sm font-bold text-ink-50">{job.name}</p>
            {ack ? (
              <Badge tone="neutral">
                <CheckCheck size={11} /> Reviewed
              </Badge>
            ) : (
              <Badge tone="green">New</Badge>
            )}
          </div>
          {job.notes && (
            <p className="mt-1 inline-flex items-center gap-1 text-2xs text-ink-400">
              <MapPin size={11} /> {job.notes}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-ink-400">
            <span className="inline-flex items-center gap-1">
              <CalendarDays size={11} /> {formatDate(job.job_date)}
            </span>
            {job.start_time && (
              <span className="inline-flex items-center gap-1">
                <Clock size={11} /> Starts {job.start_time}
              </span>
            )}
          </div>
        </div>
        {!ack && onAcknowledge && (
          <Button size="sm" icon={<CheckCheck size={13} />} onClick={() => onAcknowledge(assignment)}>
            Got it
          </Button>
        )}
      </div>
      {assignment.assigned_by && (
        <p className="mt-3 text-2xs text-ink-500">Assigned by {assignment.assigned_by}</p>
      )}
    </div>
  );
}
