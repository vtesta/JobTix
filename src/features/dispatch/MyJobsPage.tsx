import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/AuthContext';
import { formatDate } from '@/lib/format';
import { EmptyState, SkeletonDispatchDay } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Page, PageHeader } from '@/components/ui/Page';
import {
  acknowledgeAssignment,
  fetchMyAssignments,
  type DispatchJob,
  type JobAssignment,
} from './dispatchService';
import { CalendarDays, CheckCheck, Clock, HardHat, MapPin } from 'lucide-react';

type MyAssignment = JobAssignment & { job: DispatchJob };

function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function MyJobsPage({ orgId }: { orgId: string }) {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<MyAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
