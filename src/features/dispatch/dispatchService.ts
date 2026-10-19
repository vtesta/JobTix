import { supabase } from '@/lib/supabase';
import type { TeamMembership } from '@/config/types';

export type AssignmentStatus = 'assigned' | 'acknowledged';

export interface DispatchJob {
  id: string;
  organization_id: string;
  name: string;
  job_date: string;
  start_time: string | null;
  notes: string | null;
  tasks: string[];
  materials: string[];
  created_by: string;
  created_at: string;
}

export interface DispatchJobFile {
  id: string;
  organization_id: string;
  dispatch_job_id: string;
  file_name: string;
  file_path: string;
  uploaded_by: string;
  created_at: string;
}

export interface JobAssignment {
  id: string;
  organization_id: string;
  dispatch_job_id: string;
  team_member_id: string;
  status: AssignmentStatus;
  assigned_by: string;
  created_at: string;
  acknowledged_at: string | null;
}

export interface AppNotification {
  id: string;
  organization_id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  ticket_id: string | null;
  read_at: string | null;
  created_at: string;
}

/** Fetch dispatch jobs for an org within a date range (inclusive). */
export async function fetchDispatchJobs(orgId: string, rangeStart?: string, rangeEnd?: string): Promise<DispatchJob[]> {
  let query = supabase
    .from('dispatch_jobs')
    .select('*')
    .eq('organization_id', orgId)
    .order('job_date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: false });
  if (rangeStart) query = query.gte('job_date', rangeStart);
  if (rangeEnd) query = query.lte('job_date', rangeEnd);
  const { data, error } = await query;
  if (error) throw new Error('Could not load the schedule.');
  return (data ?? []) as DispatchJob[];
}

export async function createDispatchJob(
  orgId: string,
  input: { name: string; job_date: string; notes?: string | null; tasks?: string[]; materials?: string[] },
  createdBy: string,
): Promise<DispatchJob> {
  const { data, error } = await supabase
    .from('dispatch_jobs')
    .insert({
      organization_id: orgId,
      name: input.name,
      job_date: input.job_date,
      notes: input.notes ?? null,
      tasks: input.tasks ?? [],
      materials: input.materials ?? [],
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) throw new Error('Could not add the job to the schedule.');
  return data as DispatchJob;
}

export async function updateDispatchJob(id: string, updates: Partial<DispatchJob>): Promise<DispatchJob> {
  const { data, error } = await supabase
    .from('dispatch_jobs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error('Could not update the job.');
  return data as DispatchJob;
}

const DISPATCH_BUCKET = 'dispatch-files';

/** Upload a plan or photo for a dispatch job, then record it. */
export async function uploadDispatchFile(
  orgId: string,
  job: DispatchJob,
  file: File,
  uploadedBy: string,
): Promise<DispatchJobFile> {
  const safeName = file.name.replace(/[^\w.\- ]+/g, '_');
  const path = `${orgId}/${job.id}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from(DISPATCH_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (uploadError) throw new Error('Could not upload the file.');
  const { data, error } = await supabase
    .from('dispatch_job_files')
    .insert({
      organization_id: orgId,
      dispatch_job_id: job.id,
      file_name: file.name,
      file_path: path,
      uploaded_by: uploadedBy,
    })
    .select()
    .single();
  if (error) {
    void supabase.storage.from(DISPATCH_BUCKET).remove([path]);
    throw new Error('Could not save the file record.');
  }
  return data as DispatchJobFile;
}

/** Fetch all attachments for one dispatch job. */
export async function fetchDispatchFiles(jobId: string): Promise<DispatchJobFile[]> {
  const { data, error } = await supabase
    .from('dispatch_job_files')
    .select('*')
    .eq('dispatch_job_id', jobId)
    .order('created_at', { ascending: true });
  if (error) throw new Error('Could not load the files.');
  return (data ?? []) as DispatchJobFile[];
}

/** Delete a file record and its stored object. */
export async function deleteDispatchFile(file: DispatchJobFile): Promise<void> {
  const { error } = await supabase.from('dispatch_job_files').delete().eq('id', file.id);
  if (error) throw new Error('Could not remove the file.');
  void supabase.storage.from(DISPATCH_BUCKET).remove([file.file_path]);
}

/** Short-lived signed URL so crew can open plans/photos. */
export async function getDispatchFileUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(DISPATCH_BUCKET)
    .createSignedUrl(filePath, 3600);
  if (error || !data) throw new Error('Could not open the file.');
  return data.signedUrl;
}

export async function deleteDispatchJob(id: string): Promise<void> {
  const { error } = await supabase.from('dispatch_jobs').delete().eq('id', id);
  if (error) throw new Error('Could not remove the job.');
}

/** Ensure a job name exists in the shared job_names library. */
export async function ensureJobName(name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) return;
  const { data: existing } = await supabase
    .from('job_names')
    .select('id')
    .eq('name', clean)
    .maybeSingle();
  if (existing) return;
  const { error } = await supabase.from('job_names').insert({ name: clean });
  if (error) {
    // A duplicate from a concurrent add is fine — the name exists either way.
    const message = error.message ?? '';
    if (!/duplicate|unique/i.test(message)) throw new Error('Could not save the job name.');
  }
}

/** Fetch every assignment for an org (admins use this for the board). */
export async function fetchAssignments(orgId: string): Promise<JobAssignment[]> {
  const { data, error } = await supabase
    .from('job_assignments')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true });
  if (error) throw new Error('Could not load assignments.');
  return (data ?? []) as JobAssignment[];
}

/** Fetch only the current user's assignments, joined with the dispatch job. */
export async function fetchMyAssignments(orgId: string): Promise<(JobAssignment & { job: DispatchJob })[]> {
  const { data, error } = await supabase
    .from('job_assignments')
    .select('*, job:dispatch_jobs(*)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load your jobs.');
  return (data ?? []) as (JobAssignment & { job: DispatchJob })[];
}

/** Create assignments, deduplicating (one row per job + member). */
export async function createAssignments(
  orgId: string,
  dispatchJobIds: string[],
  memberIds: string[],
  assignedBy: string,
): Promise<void> {
  const existing = await fetchAssignments(orgId);
  const have = new Set(existing.map((a) => `${a.dispatch_job_id}|${a.team_member_id}`));
  const rows = dispatchJobIds.flatMap((dispatchJobId) =>
    memberIds
      .filter((memberId) => !have.has(`${dispatchJobId}|${memberId}`))
      .map((team_member_id) => ({
        organization_id: orgId,
        dispatch_job_id: dispatchJobId,
        team_member_id,
        assigned_by: assignedBy,
      })),
  );
  if (rows.length === 0) return;
  const { error } = await supabase.from('job_assignments').insert(rows);
  if (error) throw new Error('Could not assign the crew.');
}

export async function deleteAssignmentsForJob(dispatchJobId: string, memberIds: string[]): Promise<void> {
  const { error } = await supabase
    .from('job_assignments')
    .delete()
    .eq('dispatch_job_id', dispatchJobId)
    .in('team_member_id', memberIds);
  if (error) throw new Error('Could not remove the assignment.');
}

export async function acknowledgeAssignment(assignmentId: string): Promise<void> {
  const { error } = await supabase
    .from('job_assignments')
    .update({ status: 'acknowledged', acknowledged_at: new Date().toISOString() })
    .eq('id', assignmentId);
  if (error) throw new Error('Could not update the assignment.');
}

export async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error('Could not load notifications.');
  return (data ?? []) as AppNotification[];
}

export async function insertNotifications(rows: {
  organization_id: string;
  user_id: string;
  kind?: string;
  title: string;
  body?: string;
  ticket_id?: string | null;
}[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from('notifications').insert(rows);
  if (error) throw new Error('Could not send the notification.');
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error('Could not mark the notification as read.');
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) throw new Error('Could not mark notifications as read.');
}

/**
 * Notify each crew member about a newly assigned job.
 * Fire-and-forget — dispatch should not block on notification inserts.
 */
export function notifyAssignment(
  orgId: string,
  job: DispatchJob,
  members: Pick<TeamMembership, 'user_id' | 'name'>[],
  assignedBy: string,
): void {
  void insertNotifications(
    members
      .filter((m) => Boolean(m.user_id))
      .map((m) => ({
        organization_id: orgId,
        user_id: m.user_id as string,
        kind: 'assignment',
        title: `New job: ${job.name}`,
        body: `${job.job_date}${job.start_time ? ` · ${job.start_time}` : ''} · assigned by ${assignedBy}`,
        ticket_id: job.id,
      })),
  ).catch(() => undefined);
}

/** Subscribe to inserts on a table. Returns the cleanup function. */
export function subscribeToInserts(
  table: 'job_assignments' | 'notifications' | 'dispatch_jobs',
  filter: string,
  onInsert: (row: unknown) => void,
): () => void {
  const channel = supabase
    .channel(`dispatch-${table}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table, filter },
      (payload) => onInsert(payload.new),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
