/*
# Multi-tenant foundation: organizations and team members

## What this does
Turns the single-company app into a multi-employer subscription product.
Every employer gets their own private workspace ("organization"), and each
authenticated user belongs to one or more organizations as an owner, admin,
or employee. All existing data tables gain an `organization_id` column so
rows are isolated per company. The old open `USING (true)` anon policies are
replaced with org-scoped RLS policies keyed on team membership.

## New tables
1. `organizations` — company/workspace, Stripe billing fields, seat_limit
2. `team_members` — maps users to orgs with role (owner|admin|employee) and
   status (pending|active), plus invited_by

## Modified tables (additive only — no data loss)
- job_tickets, job_names, employees, timeclock_entries, qb_exports
  each gain nullable `organization_id` (FK -> organizations, ON DELETE CASCADE)

## Helper functions (SECURITY DEFINER)
- is_org_member(uuid) — true if caller has an active team_members row for org
- is_org_admin(uuid) — true if caller is owner/admin of org

## Security changes
- All open anon `USING (true)` policies dropped and replaced with org-scoped
  policies scoped TO authenticated using is_org_member / is_org_admin.
- The anon role loses access — app now requires sign-in.
- Storage bucket qb-exports re-scoped by org path convention <org_id>/<file>.

## Important notes
1. Existing rows get organization_id = NULL and will be hidden under new RLS.
   Prototype shared data is not carried into the multi-tenant product.
2. Functions are created BEFORE policies that reference them.
*/

-- =========================================================
-- 1. Create tables FIRST (no policies yet)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  default_recipient_email text NOT NULL DEFAULT '',
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_plan text NOT NULL DEFAULT 'free',
  subscription_status text NOT NULL DEFAULT 'trialing',
  seat_limit int NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'employee',
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);

-- =========================================================
-- 2. Add organization_id to existing tables (additive)
-- =========================================================
ALTER TABLE public.job_tickets
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.job_names
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.timeclock_entries
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.qb_exports
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_job_tickets_org ON public.job_tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_job_names_org ON public.job_names(organization_id);
CREATE INDEX IF NOT EXISTS idx_employees_org ON public.employees(organization_id);
CREATE INDEX IF NOT EXISTS idx_timeclock_org ON public.timeclock_entries(organization_id);
CREATE INDEX IF NOT EXISTS idx_qb_exports_org ON public.qb_exports(organization_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_organization_id ON public.team_members(organization_id);

-- =========================================================
-- 3. Helper functions (SECURITY DEFINER) — created before policies
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_org_member(target_org uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.organization_id = target_org
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(target_org uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.organization_id = target_org
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('owner', 'admin')
  );
$$;

-- =========================================================
-- 4. Enable RLS on new tables
-- =========================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 5. Drop ALL old open anon policies on existing tables
-- =========================================================
DROP POLICY IF EXISTS "Shared users can view job tickets" ON public.job_tickets;
DROP POLICY IF EXISTS "Shared users can create job tickets" ON public.job_tickets;
DROP POLICY IF EXISTS "Shared users can update job tickets" ON public.job_tickets;
DROP POLICY IF EXISTS "Shared users can delete job tickets" ON public.job_tickets;
DROP POLICY IF EXISTS "Shared users can view job names" ON public.job_names;
DROP POLICY IF EXISTS "Shared users can create job names" ON public.job_names;
DROP POLICY IF EXISTS "Shared users can update job names" ON public.job_names;
DROP POLICY IF EXISTS "Shared users can delete job names" ON public.job_names;
DROP POLICY IF EXISTS "anon_select_employees" ON public.employees;
DROP POLICY IF EXISTS "anon_insert_employees" ON public.employees;
DROP POLICY IF EXISTS "anon_update_employees" ON public.employees;
DROP POLICY IF EXISTS "anon_delete_employees" ON public.employees;
DROP POLICY IF EXISTS "anon_select_timeclock_entries" ON public.timeclock_entries;
DROP POLICY IF EXISTS "anon_insert_timeclock_entries" ON public.timeclock_entries;
DROP POLICY IF EXISTS "anon_update_timeclock_entries" ON public.timeclock_entries;
DROP POLICY IF EXISTS "anon_delete_timeclock_entries" ON public.timeclock_entries;
DROP POLICY IF EXISTS "anon_select_qb_exports" ON public.qb_exports;
DROP POLICY IF EXISTS "anon_insert_qb_exports" ON public.qb_exports;
DROP POLICY IF EXISTS "anon_delete_qb_exports_table" ON public.qb_exports;

-- Drop old storage policies too
DROP POLICY IF EXISTS "anon_upload_qb_exports" ON storage.objects;
DROP POLICY IF EXISTS "anon_read_qb_exports" ON storage.objects;
DROP POLICY IF EXISTS "anon_delete_qb_exports" ON storage.objects;

-- =========================================================
-- 6. Organizations policies
-- =========================================================
CREATE POLICY "read_own_organization"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (is_org_member(id));

CREATE POLICY "update_own_organization"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (is_org_admin(id))
  WITH CHECK (is_org_admin(id));

-- =========================================================
-- 7. team_members policies
-- =========================================================
CREATE POLICY "read_team_members"
  ON public.team_members FOR SELECT
  TO authenticated
  USING (
    is_org_admin(organization_id)
    OR user_id = auth.uid()
  );

CREATE POLICY "insert_team_members"
  ON public.team_members FOR INSERT
  TO authenticated
  WITH CHECK (
    is_org_admin(organization_id)
    AND email IS NOT NULL
  );

CREATE POLICY "update_team_members"
  ON public.team_members FOR UPDATE
  TO authenticated
  USING (
    is_org_admin(organization_id)
    OR user_id = auth.uid()
  )
  WITH CHECK (
    is_org_admin(organization_id)
    OR user_id = auth.uid()
  );

CREATE POLICY "delete_team_members"
  ON public.team_members FOR DELETE
  TO authenticated
  USING (is_org_admin(organization_id));

-- =========================================================
-- 8. Org-scoped policies on existing tables
-- =========================================================
-- job_tickets
CREATE POLICY "select_org_job_tickets"
  ON public.job_tickets FOR SELECT TO authenticated
  USING (is_org_member(organization_id));
CREATE POLICY "insert_org_job_tickets"
  ON public.job_tickets FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organization_id));
CREATE POLICY "update_org_job_tickets"
  ON public.job_tickets FOR UPDATE TO authenticated
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));
CREATE POLICY "delete_org_job_tickets"
  ON public.job_tickets FOR DELETE TO authenticated
  USING (is_org_member(organization_id));

-- job_names
CREATE POLICY "select_org_job_names"
  ON public.job_names FOR SELECT TO authenticated
  USING (is_org_member(organization_id));
CREATE POLICY "insert_org_job_names"
  ON public.job_names FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organization_id));
CREATE POLICY "update_org_job_names"
  ON public.job_names FOR UPDATE TO authenticated
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));
CREATE POLICY "delete_org_job_names"
  ON public.job_names FOR DELETE TO authenticated
  USING (is_org_member(organization_id));

-- employees
CREATE POLICY "select_org_employees"
  ON public.employees FOR SELECT TO authenticated
  USING (is_org_member(organization_id));
CREATE POLICY "insert_org_employees"
  ON public.employees FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organization_id));
CREATE POLICY "update_org_employees"
  ON public.employees FOR UPDATE TO authenticated
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));
CREATE POLICY "delete_org_employees"
  ON public.employees FOR DELETE TO authenticated
  USING (is_org_member(organization_id));

-- timeclock_entries
CREATE POLICY "select_org_timeclock_entries"
  ON public.timeclock_entries FOR SELECT TO authenticated
  USING (is_org_member(organization_id));
CREATE POLICY "insert_org_timeclock_entries"
  ON public.timeclock_entries FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organization_id));
CREATE POLICY "update_org_timeclock_entries"
  ON public.timeclock_entries FOR UPDATE TO authenticated
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));
CREATE POLICY "delete_org_timeclock_entries"
  ON public.timeclock_entries FOR DELETE TO authenticated
  USING (is_org_member(organization_id));

-- qb_exports
CREATE POLICY "select_org_qb_exports"
  ON public.qb_exports FOR SELECT TO authenticated
  USING (is_org_member(organization_id));
CREATE POLICY "insert_org_qb_exports"
  ON public.qb_exports FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organization_id));
CREATE POLICY "delete_org_qb_exports"
  ON public.qb_exports FOR DELETE TO authenticated
  USING (is_org_member(organization_id));

-- =========================================================
-- 9. Storage: re-scope qb-exports bucket by org path <org_id>/<file>
-- =========================================================
CREATE POLICY "org_upload_qb_exports" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'qb-exports'
    AND is_org_member((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "org_read_qb_exports" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'qb-exports'
    AND is_org_member((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "org_delete_qb_exports" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'qb-exports'
    AND is_org_member((storage.foldername(name))[1]::uuid)
  );
