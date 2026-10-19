/*
# Remove unverified employees — verified accounts only

1. Deletes all employee rows that have no linked verified account (user_id IS NULL).
   Their timeclock entries are removed automatically via cascade.
2. Adds a NOT NULL constraint on employees.user_id so every future employee row
   must be tied to a real signed-up account. Manual, unverified employee entries
   are no longer possible at the database level.
3. Drops the old permissive employees policies and replaces them with
   membership-scoped policies: users can only see and use employee rows in
   workspaces they belong to, and inserts are only allowed for their own account.
4. Removes the old employees-related behavior that relied on name-only rows.

## Important notes
- Employee profiles are now created exclusively by handle_new_user() and
  claim_pending_invites(), both of which link a verified auth account.
- Removing a team member should also remove their employee profile; the app
  handles this via delete on team_members.
*/

-- =========================================================
-- 1. Delete unverified employee rows (cascades their timeclock entries)
-- =========================================================
DELETE FROM public.employees WHERE user_id IS NULL;

-- =========================================================
-- 2. Require a verified account on every employee row
-- =========================================================
ALTER TABLE public.employees
  ALTER COLUMN user_id SET NOT NULL;

-- =========================================================
-- 3. Replace permissive policies with membership-scoped ones
-- =========================================================
DROP POLICY IF EXISTS "anon_select_employees" ON public.employees;
DROP POLICY IF EXISTS "anon_insert_employees" ON public.employees;
DROP POLICY IF EXISTS "anon_update_employees" ON public.employees;
DROP POLICY IF EXISTS "anon_delete_employees" ON public.employees;

CREATE POLICY "members_select_employees" ON public.employees FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.organization_id = employees.organization_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  );

CREATE POLICY "members_insert_own_employee" ON public.employees FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.organization_id = employees.organization_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  );

CREATE POLICY "members_update_employee" ON public.employees FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.organization_id = employees.organization_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.organization_id = employees.organization_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  );

CREATE POLICY "members_delete_employee" ON public.employees FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.organization_id = employees.organization_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
        AND tm.role IN ('owner', 'admin')
    )
  );

-- =========================================================
-- 4. Mirror the same lockdown for timeclock entries
--    (they reference employees; scope them to org members too)
-- =========================================================
DROP POLICY IF EXISTS "anon_select_timeclock_entries" ON public.timeclock_entries;
DROP POLICY IF EXISTS "anon_insert_timeclock_entries" ON public.timeclock_entries;
DROP POLICY IF EXISTS "anon_update_timeclock_entries" ON public.timeclock_entries;
DROP POLICY IF EXISTS "anon_delete_timeclock_entries" ON public.timeclock_entries;

CREATE POLICY "members_select_timeclock" ON public.timeclock_entries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.organization_id = timeclock_entries.organization_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  );

CREATE POLICY "members_insert_timeclock" ON public.timeclock_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.organization_id = timeclock_entries.organization_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  );

CREATE POLICY "members_update_timeclock" ON public.timeclock_entries FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.organization_id = timeclock_entries.organization_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.organization_id = timeclock_entries.organization_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  );

CREATE POLICY "members_delete_timeclock" ON public.timeclock_entries FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = timeclock_entries.employee_id
        AND e.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.organization_id = timeclock_entries.organization_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
        AND tm.role IN ('owner', 'admin')
    )
  );
