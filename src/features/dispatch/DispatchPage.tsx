import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import { Page, PageHeader } from '@/components/ui/Page';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, SkeletonDispatchDay } from '@/components/ui/States';
import { formatDate } from '@/lib/format';
import type { Ticket, TeamMembership, JobName } from '@/config/types';
import {
  acknowledgeAssignment,
  createAssignments,
  createDispatchJob,
  deleteAssignmentsForJob,
  deleteDispatchFile,
  deleteDispatchJob,
  ensureJobName,
  fetchAssignments,
  fetchDispatchFiles,
  fetchDispatchJobs,
  getDispatchFileUrl,
  notifyAssignment,
  uploadDispatchFile,
  type DispatchJob,
  type DispatchJobFile,
  type JobAssignment,
} from './dispatchService';
import {
  CalendarDays,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  ListTodo,
  MapPin,
  Package,
  Paperclip,
  Radar,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

interface DispatchPageProps {
  orgId: string;
}

function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function DispatchPage({ orgId }: DispatchPageProps) {
  const { currentMembership } = useAuth();
  const { toast } = useToast();
  const [day, setDay] = useState(todayIso());
  const [jobs, setJobs] = useState<DispatchJob[]>([]);
  const [assignments, setAssignments] = useState<JobAssignment[]>([]);
  const [members, setMembers] = useState<TeamMembership[]>([]);
  const [jobNames, setJobNames] = useState<JobName[]>([]);
  const [loading, setLoading] = useState(true);
  const [navigating, setNavigating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRange = useRef<{ start: string; end: string } | null>(null);

  // Add-job form state
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [tasks, setTasks] = useState<string[]>([]);
  const [materials, setMaterials] = useState<string[]>([]);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Per-job details state (tasks/materials/files view on cards)
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [detailsJobId, setDetailsJobId] = useState<string | null>(null);
  const [filesByJob, setFilesByJob] = useState<Record<string, DispatchJobFile[]>>({});

  const crew = useMemo(() => members.filter((m) => m.status === 'active'), [members]);
  const memberById = useMemo(() => new Map(crew.map((m) => [m.id, m])), [crew]);

  // Team roster and job library load once per workspace.
  useEffect(() => {
    let cancelled = false;
    const loadMembers = async () => {
      const { data } = await supabase
        .from('team_members')
        .select('*')
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .order('name', { ascending: true });
      return (data ?? []) as TeamMembership[];
    };
    const loadJobNames = async () => {
      const { data } = await supabase
        .from('job_names')
        .select('*')
        .eq('organization_id', orgId)
        .order('name', { ascending: true });
      return (data ?? []) as JobName[];
    };
    Promise.all([loadMembers(), loadJobNames()])
      .then(([m, jn]) => {
        if (cancelled) return;
        setMembers(m);
        setJobNames(jn);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // The schedule loads a +-30 day window once; day-stepping inside it is instant.
  // Only when the viewed day leaves the loaded range do we fetch again.
  useEffect(() => {
    let cancelled = false;
    const range = loadedRange.current;
    if (range && day >= range.start && day <= range.end) return;
    if (!range) setLoading(true);
    else setNavigating(true);
    const windowStart = shiftIso(day, -30);
    const windowEnd = shiftIso(day, 30);
    Promise.all([
      fetchDispatchJobs(orgId, windowStart, windowEnd),
      fetchAssignments(orgId),
    ])
      .then(([j, a]) => {
        if (cancelled) return;
        setJobs((prev) => {
          const byId = new Map(prev.map((job) => [job.id, job]));
          for (const job of j) byId.set(job.id, job);
          return [...byId.values()].sort((x, y) =>
            x.job_date.localeCompare(y.job_date) || (x.start_time ?? '').localeCompare(y.start_time ?? ''),
          );
        });
        setAssignments(a);
        setError(null);
        loadedRange.current = { start: windowStart, end: windowEnd };
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the dispatch board.');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setNavigating(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, day]);

  const assignmentsByJob = useMemo(() => {
    const map = new Map<string, JobAssignment[]>();
    for (const a of assignments) {
      const list = map.get(a.dispatch_job_id) ?? [];
      list.push(a);
      map.set(a.dispatch_job_id, list);
    }
    return map;
  }, [assignments]);

  /** member id -> set of dates they are assigned to (double-booking flags) */
  const busyByMember = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const jobById = new Map(jobs.map((j) => [j.id, j]));
    for (const a of assignments) {
      const j = jobById.get(a.dispatch_job_id);
      if (!j) continue;
      const set = map.get(a.team_member_id) ?? new Set<string>();
      set.add(j.job_date);
      map.set(a.team_member_id, set);
    }
    return map;
  }, [assignments, jobs]);

  const dayJobs = useMemo(() => jobs.filter((j) => j.job_date === day), [jobs, day]);

  const resetForm = () => {
    setName('');
    setNotes('');
    setTasks([]);
    setMaterials([]);
    setStagedFiles([]);
    setDetailsOpen(false);
  };

  const addJob = async () => {
    const clean = name.trim();
    if (!clean || saving) return;
    setSaving(true);
    try {
      const created = await createDispatchJob(
        orgId,
        {
          name: clean,
          job_date: day,
          notes: notes.trim() || null,
          tasks: tasks.map((t) => t.trim()).filter(Boolean),
          materials: materials.map((m) => m.trim()).filter(Boolean),
        },
        currentMembership?.name ?? '',
      );
      void ensureJobName(orgId, clean);
      for (const file of stagedFiles) {
        try {
          const record = await uploadDispatchFile(orgId, created, file, currentMembership?.name ?? '');
          setFilesByJob((prev) => ({ ...prev, [created.id]: [...(prev[created.id] ?? []), record] }));
        } catch {
          // The job itself is saved; a failed attachment should not block it.
        }
      }
      setJobs((prev) => [...prev, created].sort((a, b) => a.job_date.localeCompare(b.job_date)));
      toast(`Job added to ${dayLabel}`);
      resetForm();
      setFormOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the job.');
    } finally {
      setSaving(false);
    }
  };

  const toggleDetails = async (jobId: string) => {
    const next = detailsJobId === jobId ? null : jobId;
    setDetailsJobId(next);
    if (next && !filesByJob[next]) {
      try {
        const files = await fetchDispatchFiles(next);
        setFilesByJob((prev) => ({ ...prev, [next]: files }));
      } catch {
        setFilesByJob((prev) => ({ ...prev, [next]: [] }));
      }
    }
  };

  const handleUpload = async (job: DispatchJob, fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    for (const file of Array.from(fileList)) {
      try {
        const record = await uploadDispatchFile(orgId, job, file, currentMembership?.name ?? '');
        setFilesByJob((prev) => ({ ...prev, [job.id]: [...(prev[job.id] ?? []), record] }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not upload the file.');
      }
    }
  };

  const handleRemoveFile = async (jobId: string, file: DispatchJobFile) => {
    try {
      await deleteDispatchFile(file);
      setFilesByJob((prev) => ({ ...prev, [jobId]: (prev[jobId] ?? []).filter((f) => f.id !== file.id) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the file.');
    }
  };

  const openFile = async (file: DispatchJobFile) => {
    try {
      const url = await getDispatchFileUrl(file.file_path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the file.');
    }
  };

  const assign = async (job: DispatchJob, memberId: string) => {
    const already = assignmentsByJob.get(job.id)?.some((a) => a.team_member_id === memberId);
    if (already) return;
    try {
      await createAssignments(orgId, [job.id], [memberId], currentMembership?.name ?? '');
      setAssignments((rows) => [
        ...rows,
        {
          id: `temp-${Date.now()}`,
          organization_id: orgId,
          dispatch_job_id: job.id,
          team_member_id: memberId,
          status: 'assigned',
          assigned_by: currentMembership?.name ?? '',
          created_at: new Date().toISOString(),
          acknowledged_at: null,
        },
      ]);
      const member = memberById.get(memberId);
      if (member) notifyAssignment(orgId, job, [member], currentMembership?.name ?? '');
      toast(`${member?.name ?? 'Crew member'} assigned to ${job.name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not assign the crew member.');
    }
  };

  const unassign = async (jobId: string, memberId: string) => {
    try {
      await deleteAssignmentsForJob(jobId, [memberId]);
      setAssignments((rows) => rows.filter((r) => !(r.dispatch_job_id === jobId && r.team_member_id === memberId)));
      toast('Assignment removed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the assignment.');
    }
  };

  const removeJob = async (job: DispatchJob) => {
    try {
      await deleteDispatchJob(job.id);
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
      setAssignments((rows) => rows.filter((r) => r.dispatch_job_id !== job.id));
      toast(`${job.name} removed from the schedule`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the job.');
    }
  };

  const dayLabel = formatDate(day);

  return (
    <Page>
      <PageHeader
        title="Dispatch"
        description="Where the crew is going each day."
        actions={
          <Button icon={<UserPlus size={16} />} onClick={() => setFormOpen((o) => !o)}>
            {formOpen ? 'Close' : 'Add job'}
          </Button>
        }
      />

      {error && (
        <p className="mb-3 rounded-lg border border-error-600/40 bg-error-600/10 px-3 py-2 text-xs text-error-400">
          {error}
        </p>
      )}

      {navigating && (
        <p className="mb-3 text-2xs font-semibold text-ink-400">Loading that week…</p>
      )}

      {/* Day navigation */}
      <div className="mb-4 flex items-center justify-between rounded-xl border border-ink-700 bg-ink-850 px-4 py-3">
        <button
          onClick={() => setDay((d) => shiftIso(d, -1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-300 transition-colors hover:bg-ink-800 hover:text-ink-100"
          aria-label="Previous day"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="text-sm font-bold text-ink-50">{dayLabel}</p>
          {day === todayIso() && <p className="text-2xs font-semibold uppercase tracking-wider text-green-400">Today</p>}
          {day !== todayIso() && (
            <button
              onClick={() => setDay(todayIso())}
              className="text-2xs font-semibold text-green-400 hover:text-green-300"
            >
              Jump to today
            </button>
          )}
        </div>
        <button
          onClick={() => setDay((d) => shiftIso(d, 1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-300 transition-colors hover:bg-ink-800 hover:text-ink-100"
          aria-label="Next day"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Add-job form */}
      {formOpen && (
        <div className="mb-4 rounded-xl border border-ink-700 bg-ink-850 p-4 animate-fade-up">
          <p className="mb-2 text-xs font-bold text-ink-100">New job for {dayLabel}</p>

          {/* Job picker: tap a saved job chip */}
          {jobNames.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-2xs font-bold uppercase tracking-wider text-ink-400">Pick a job</p>
              <div className="flex flex-wrap gap-1.5">
                {jobNames.map((j) => {
                  const selected = name === j.name;
                  return (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => {
                        setName(j.name);
                        if (j.notes && !notes.trim()) setNotes(j.notes);
                      }}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        selected
                          ? 'border-green-500 bg-green-500/15 text-green-300'
                          : 'border-ink-600 bg-ink-800 text-ink-200 hover:border-green-500/40 hover:text-green-300'
                      }`}
                    >
                      {j.name}
                    </button>
                  );
                })}
              </div>
              <input
                className="field-input mt-2"
                placeholder="Or type a new job name"
                value={name}
                aria-label="Job name"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addJob();
                }}
              />
            </div>
          )}
          {jobNames.length === 0 && (
            <input
              className="field-input mb-3"
              placeholder="Job or location name"
              value={name}
              autoFocus
              aria-label="Job name"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addJob();
              }}
            />
          )}

          <input
            className="field-input"
            placeholder="Note (gate code, parking…)"
            value={notes}
            aria-label="Note (optional)"
            onChange={(e) => setNotes(e.target.value)}
          />

          {/* Expandable details: tasks, materials, files */}
          <button
            type="button"
            onClick={() => setDetailsOpen((o) => !o)}
            className="mt-3 flex w-full items-center gap-2 rounded-lg border border-ink-600 bg-ink-800/60 px-3 py-2 text-xs font-semibold text-ink-200 transition-colors hover:border-green-500/40"
            aria-expanded={detailsOpen}
          >
            <ChevronDown size={14} className={`transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
            Add details for the crew
            <span className="ml-auto text-2xs font-normal text-ink-400">
              {tasks.length + materials.length > 0 || stagedFiles.length > 0
                ? `${tasks.length + materials.length} item${tasks.length + materials.length === 1 ? '' : 's'}${stagedFiles.length > 0 ? ` · ${stagedFiles.length} file${stagedFiles.length === 1 ? '' : 's'}` : ''}
                : 'optional'}
            </span>
          </button>
          {detailsOpen && (
            <div className="mt-2 space-y-3 rounded-lg border border-ink-700 bg-ink-900/60 p-3">
              <ChipListEditor
                label="Task list"
                icon={<ListTodo size={13} />}
                placeholder="e.g. Demo bathroom floor"
                items={tasks}
                onChange={setTasks}
              />
              <ChipListEditor
                label="Material list"
                icon={<Package size={13} />}
                placeholder="e.g. 10 sheets 1/2 in drywall"
                items={materials}
                onChange={setMaterials}
              />
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-ink-400">
                  <Paperclip size={12} /> Plans or photos
                </p>
                {stagedFiles.length > 0 && (
                  <div className="mb-1.5 flex flex-wrap gap-1.5">
                    {stagedFiles.map((f, i) => (
                      <span
                        key={`${f.name}-${i}`}
                        className="inline-flex items-center gap-1 rounded-full border border-ink-600 bg-ink-800 px-2.5 py-1 text-2xs text-ink-200"
                      >
                        <FileText size={11} className="shrink-0 text-green-400" />
                        <span className="max-w-[160px] truncate">{f.name}</span>
                        <button
                          type="button"
                          onClick={() => setStagedFiles((files) => files.filter((_, idx) => idx !== i))}
                          className="text-ink-400 hover:text-error-400"
                          aria-label={`Remove ${f.name}`}
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-ink-600 px-3 py-2 text-2xs font-semibold text-ink-300 transition-colors hover:border-green-500/50 hover:text-green-300">
                  <Paperclip size={12} /> Attach files
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      setStagedFiles((files) => [...files, ...Array.from(e.target.files ?? [])]);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>
          )}

          <div className="mt-3 flex justify-end">
            <Button onClick={() => void addJob()} disabled={!name.trim() || saving}>
              {saving ? 'Adding…' : 'Add to schedule'}
            </Button>
          </div>
        </div>
      )}

      {/* Day schedule */}
      {loading || navigating ? (
        <SkeletonDispatchDay rows={navigating ? 1 : 3} />
      ) : dayJobs.length === 0 ? (
        <EmptyState
          icon={<Radar size={20} />}
          title="No jobs scheduled"
          description={`Nothing scheduled for ${dayLabel} yet. Add a job to get the crew moving.`}
        />
      ) : (
        <div className="space-y-2.5">
          {dayJobs.map((job) => {
            const assigned = assignmentsByJob.get(job.id) ?? [];
            const open = openJobId === job.id;
            return (
              <div key={job.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {job.start_time && (
                        <span className="rounded-md bg-ink-800 px-2 py-0.5 text-2xs font-bold tabular-nums text-green-300">
                          {job.start_time}
                        </span>
                      )}
                      <p className="truncate text-sm font-bold text-ink-50">{job.name}</p>
                      <Badge tone={assigned.length > 0 ? 'green' : 'warning'}>
                        {assigned.length === 0 ? 'Unassigned' : `${assigned.length} assigned`}
                      </Badge>
                    </div>
                    {job.notes && <p className="mt-1 text-2xs text-ink-400">{job.notes}</p>}
                    {(job.tasks?.length > 0 || job.materials?.length > 0) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-400">
                        {job.tasks?.length > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <ListTodo size={11} /> {job.tasks.length} task{job.tasks.length === 1 ? '' : 's'}
                          </span>
                        )}
                        {job.materials?.length > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Package size={11} /> {job.materials.length} material{job.materials.length === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-ink-500">
                      {assigned.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Users size={11} /> {assigned.map((a) => memberById.get(a.team_member_id)?.name ?? 'Member').join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<UserPlus size={13} />}
                      onClick={() => setOpenJobId(open ? null : job.id)}
                    >
                      {open ? 'Close' : 'Assign crew'}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<ListTodo size={13} />}
                      onClick={() => void toggleDetails(job.id)}
                    >
                      Details
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${job.name}`}
                      onClick={() => void removeJob(job)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>

                {assigned.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {assigned.map((a) => {
                      const member = memberById.get(a.team_member_id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => void unassign(job.id, a.team_member_id)}
                          title="Click to remove from this job"
                          className="group inline-flex items-center gap-1.5 rounded-full border border-ink-600 bg-ink-800 px-2.5 py-1 text-2xs font-semibold text-ink-200 transition-colors hover:border-error-500/50 hover:text-error-300"
                        >
                          {member?.name ?? 'Member'}
                          {a.status === 'acknowledged' ? (
                            <CheckCheck size={11} className="text-green-400" />
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-warning-400" title="Not reviewed yet" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {detailsJobId === job.id && (
                  <JobDetailsPanel
                    job={job}
                    files={filesByJob[job.id] ?? []}
                    onUpload={(files) => void handleUpload(job, files)}
                    onRemoveFile={(file) => void handleRemoveFile(job.id, file)}
                    onOpenFile={(file) => void openFile(file)}
                  />
                )}

                {open && (
                  <div className="mt-3 rounded-lg border border-ink-700 bg-ink-850 p-3">
                    <p className="mb-2 text-2xs font-bold uppercase tracking-wider text-ink-400">
                      Click a name to assign
                    </p>
                    {crew.length === 0 ? (
                      <p className="text-xs text-ink-400">
                        No active team members yet — invite crew on the Team page.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {crew.map((m) => {
                          const alreadyHere = assigned.some((a) => a.team_member_id === m.id);
                          const jobsToday = [...assignments]
                            .filter((a) =>
                              a.team_member_id === m.id &&
                              a.dispatch_job_id !== job.id &&
                              jobs.find((j) => j.id === a.dispatch_job_id)?.job_date === day,
                            ).length;
                          const busy = jobsToday > 0;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              disabled={alreadyHere}
                              onClick={() => void assign(job, m.id)}
                              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-2xs font-semibold transition-colors ${
                                alreadyHere
                                  ? 'cursor-default border-ink-700 bg-ink-900 text-ink-500'
                                  : busy
                                    ? 'border-warning-500/50 bg-warning-500/10 text-warning-300 hover:bg-warning-500/20'
                                    : 'border-ink-600 bg-ink-800 text-ink-200 hover:border-green-500/50 hover:bg-green-500/10 hover:text-green-300'
                              }`}
                            >
                              {m.name}
                              {busy && (
                                <span className="inline-flex items-center gap-0.5">
                                  <MapPin size={10} /> on another job
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
}

function ChipListEditor({
  label,
  icon,
  placeholder,
  items,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  placeholder: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const clean = draft.trim();
    if (!clean) return;
    onChange([...items, clean]);
    setDraft('');
  };
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-ink-400">
        {icon} {label}
      </p>
      {items.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span
              key={`${item}-${i}`}
              className="inline-flex items-center gap-1 rounded-full border border-ink-600 bg-ink-800 px-2.5 py-1 text-2xs text-ink-100"
            >
              {item}
              <button
                type="button"
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                className="text-ink-400 hover:text-error-400"
                aria-label={`Remove ${item}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className="field-input"
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </div>
  );
}

function JobDetailsPanel({
  job,
  files,
  onUpload,
  onRemoveFile,
  onOpenFile,
}: {
  job: DispatchJob;
  files: DispatchJobFile[];
  onUpload: (files: FileList | null) => void;
  onRemoveFile: (file: DispatchJobFile) => void;
  onOpenFile: (file: DispatchJobFile) => void;
}) {
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-ink-700 bg-ink-850 p-3">
      {job.tasks?.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-ink-400">
            <ListTodo size={12} /> Task list
          </p>
          <ul className="space-y-1">
            {job.tasks.map((task, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-ink-100">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" />
                {task}
              </li>
            ))}
          </ul>
        </div>
      )}
      {job.materials?.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-ink-400">
            <Package size={12} /> Materials
          </p>
          <div className="flex flex-wrap gap-1.5">
            {job.materials.map((mat, i) => (
              <span
                key={i}
                className="rounded-full border border-ink-600 bg-ink-800 px-2.5 py-1 text-2xs text-ink-100"
              >
                {mat}
              </span>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-ink-400">
          <Paperclip size={12} /> Plans or photos
        </p>
        {files.length > 0 && (
          <div className="mb-1.5 space-y-1">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5"
              >
                <FileText size={13} className="shrink-0 text-green-400" />
                <button
                  onClick={() => onOpenFile(file)}
                  className="min-w-0 flex-1 truncate text-left text-2xs font-semibold text-ink-100 hover:text-green-300"
                >
                  {file.file_name}
                </button>
                <button
                  onClick={() => onRemoveFile(file)}
                  className="shrink-0 text-ink-400 hover:text-error-400"
                  aria-label={`Remove ${file.file_name}`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        {files.length === 0 && <p className="text-2xs text-ink-500">No files yet.</p>}
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-ink-600 px-3 py-2 text-2xs font-semibold text-ink-300 transition-colors hover:border-green-500/50 hover:text-green-300">
          <Paperclip size={12} /> Upload plans or photos
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              onUpload(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </div>
  );
}
