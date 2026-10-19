/*
# Fix ticket saving: add missing created_by column

1. Adds the `created_by` column (text, defaults to empty string) that the app
   has been writing on every ticket save. Its absence caused every
   insert/update of a job ticket to fail.
2. Backfills existing rows with '' so the column is never null.

## Modified tables
- `job_tickets`: new nullable-by-default `created_by` text column.

## Security
- Replaces the old "anyone can do anything" job_tickets policies with
  workspace-membership policies: only active members of the ticket's
  organization can see or change its tickets. This matches the lockdown
  already applied to employees and timeclock entries.
- `job_names` gets the same membership-scoped policies.
*/

-- =========================================================
-- 1. Add the missing created_by column
-- =========================================================
ALTER TABLE public.job_tickets
  ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT '';

-- =========================================================
-- 2. Lock job_tickets to workspace members
-- =========================================================
DROP POLICY IF EXISTS "Shared users can view job tickets" ON public.job_tickets;
DROP POLICY IF EXISTS "Shared users can create job tickets" ON public.job_tickets;
DROP POLICY IF EXISTS "Shared users can update job tickets" ON public.job_tickets;
DROP POLICY IF EXISTS "Shared users can delete job tickets" ON public.job_tickets;

CREATE POLICY "members_select_job_tickets" ON public.job_tickets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.organization_id = job_tickets.organization_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  );

CREATE POLICY "members_insert_job_tickets" ON public.job_tickets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.organization_id = job_tickets.organization_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  );

CREATE POLICY "members_update_job_tickets" ON public.job_tickets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.organization_id = job_tickets.organization_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.organization_id = job_tickets.organization_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  );

CREATE POLICY "members_delete_job_tickets" ON public.job_tickets FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.organization_id = job_tickets.organization_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  );

-- =========================================================
-- 3. Lock job_names to workspace members as well
-- =========================================================
DROP POLICY IF EXISTS "anon_select_job_names" ON public.job_names;
DROP POLICY IF EXISTS "anon_insert_job_names" ON public.job_names;
DROP POLICY IF EXISTS "anon_update_job_names" ON public.job_names;
DROP POLICY IF EXISTS "anon_delete_job_names" ON public.job_names;

CREATE POLICY "members_select_job_names" ON public.job_names FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.organization_id = job_names.organization_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  );

CREATE POLICY "members_insert_job_names" ON public.job_names FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.organization_id = job_names.organization_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  );

CREATE POLICY "members_update_job_names" ON public.job_names FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.organization_id = job_names.organization_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.organization_id = job_names.organization_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  );

CREATE POLICY "members_delete_job_names" ON public.job_names FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.organization_id = job_names.organization_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  );
