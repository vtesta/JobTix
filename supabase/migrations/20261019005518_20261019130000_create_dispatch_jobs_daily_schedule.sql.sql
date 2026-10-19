/*
# Dispatch jobs: daily crew schedule board

1. Why
- Dispatch replaces the owners' daily "where is everyone going" text message.
- Dispatch needs its OWN job list (where the crew goes each day), separate
  from job_tickets. Tickets stay untouched — they are the crew's field
  time/work log and are finalized.

2. New Tables
- `dispatch_jobs` — one row per job location scheduled for a day.
  - `id` (uuid, primary key)
  - `organization_id` (uuid, not null, FK organizations, on delete cascade)
  - `name` (text, not null) — job/location name
  - `job_date` (date, not null) — the day this job is scheduled
  - `start_time` (text, null) — optional start time
  - `notes` (text, null) — optional short note (gate code, parking, etc.)
  - `created_by` (text) — display name of who added it
  - `created_at` (timestamptz, default now())
  - Index on (organization_id, job_date) for fast day lookups.

3. Modified Tables
- `job_assignments` — repointed from tickets to dispatch jobs:
  - existing test rows removed (feature is one day old, user approved wipe)
  - `ticket_id` column dropped, replaced by `dispatch_job_id`
    (uuid, not null, FK dispatch_jobs, on delete cascade)
  - new unique index on (dispatch_job_id, team_member_id)
- `notifications` — unchanged; its `ticket_id` column is a plain uuid with
  no foreign key and now stores the dispatch job id as the jump target.

4. Security
- RLS enabled on `dispatch_jobs`.
  - Admins (owner/admin via is_org_admin) full CRUD on their org's rows.
  - Crew can SELECT only jobs they are assigned to (needed so the app can
    load the job details joined to their assignments).
- job_assignments policies unchanged (admins manage, crew see/acknowledge
  their own rows).
- `dispatch_jobs` added to the supabase_realtime publication for live updates.

5. Notes
- Idempotent: safe to re-run.
- Adding a dispatch job does NOT create a ticket. New job names are also
  added to the shared job_names library by the app so the ticket form can
  find them later.
*/

CREATE TABLE IF NOT EXISTS public.dispatch_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  job_date date NOT NULL,
  start_time text,
  notes text,
  created_by text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_org_date
  ON public.dispatch_jobs(organization_id, job_date);

ALTER TABLE public.dispatch_jobs ENABLE ROW LEVEL SECURITY;

-- Repoint job_assignments FIRST (policies below depend on the new column)
DELETE FROM public.job_assignments;

ALTER TABLE public.job_assignments DROP COLUMN IF EXISTS ticket_id;
ALTER TABLE public.job_assignments
  ADD COLUMN IF NOT EXISTS dispatch_job_id uuid REFERENCES public.dispatch_jobs(id) ON DELETE CASCADE;
ALTER TABLE public.job_assignments ALTER COLUMN dispatch_job_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_job_assignments_job_member
  ON public.job_assignments(dispatch_job_id, team_member_id);
CREATE INDEX IF NOT EXISTS idx_job_assignments_job
  ON public.job_assignments(dispatch_job_id);

-- Now the dispatch_jobs policies
DROP POLICY IF EXISTS "select_dispatch_jobs_admin_or_assigned" ON public.dispatch_jobs;
CREATE POLICY "select_dispatch_jobs_admin_or_assigned" ON public.dispatch_jobs
  FOR SELECT TO authenticated
  USING (
    is_org_admin(organization_id)
    OR EXISTS (
      SELECT 1
      FROM public.job_assignments ja
      JOIN public.team_members tm ON tm.id = ja.team_member_id
      WHERE ja.dispatch_job_id = dispatch_jobs.id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "insert_dispatch_jobs_admin" ON public.dispatch_jobs;
CREATE POLICY "insert_dispatch_jobs_admin" ON public.dispatch_jobs
  FOR INSERT TO authenticated
  WITH CHECK (is_org_admin(organization_id));

DROP POLICY IF EXISTS "update_dispatch_jobs_admin" ON public.dispatch_jobs;
CREATE POLICY "update_dispatch_jobs_admin" ON public.dispatch_jobs
  FOR UPDATE TO authenticated
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

DROP POLICY IF EXISTS "delete_dispatch_jobs_admin" ON public.dispatch_jobs;
CREATE POLICY "delete_dispatch_jobs_admin" ON public.dispatch_jobs
  FOR DELETE TO authenticated
  USING (is_org_admin(organization_id));

-- Realtime for the new table
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_jobs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
