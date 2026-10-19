/*
# Enforce role-based permissions (admins only for management actions)

## 1. Why
Every write policy on employees, job_names, job_tickets, timeclock_entries and
qb_exports only checked "is this user an active member of the organization".
That gave every crew member full admin power at the database level: adding or
renaming employees, creating/deleting job names, editing or deleting anyone's
tickets, and punching the clock for other people.

## 2. What changes
Policies are replaced so that:
- Employees: crew members can create their own employee record and edit only
  their own row. Only owners/admins can rename or delete other employees.
- Job names: only owners/admins can add, rename, or delete jobs. Everyone in
  the org can still see the list to pick from on tickets.
- Job tickets: everyone can see tickets and create new ones. Crew members can
  only edit/delete tickets they created. Owners/admins can edit/delete any.
- Timeclock: crew members can only punch for their own linked employee record.
  Owners/admins can add, edit, or delete entries for anyone.
- QB exports: only owners/admins can record or view QuickBooks export history.
- Read access stays unchanged: any active member of the org can read its data.

## 3. Security changes
- Drops the permissive member-level write policies listed below.
- New policies use is_org_admin() (owner or admin in team_members) for
  management writes and per-row ownership checks for self-service writes.

## 4. Notes
- Read policies are untouched, so nothing the app already displays changes.
- team_members and organizations policies were already role-aware and untouched.
*/

/* ---------- employees ---------- */
DROP POLICY IF EXISTS "insert_org_employees" ON employees;
DROP POLICY IF EXISTS "update_org_employees" ON employees;
DROP POLICY IF EXISTS "delete_org_employees" ON employees;
DROP POLICY IF EXISTS "members_insert_own_employee" ON employees;
DROP POLICY IF EXISTS "members_update_employee" ON employees;
DROP POLICY IF EXISTS "members_delete_employee" ON employees;

CREATE POLICY "insert_employees_self_or_admin" ON employees FOR INSERT
TO authenticated
WITH CHECK (
  (user_id = auth.uid() AND is_org_member(organization_id))
  OR is_org_admin(organization_id)
);

CREATE POLICY "update_employees_self_or_admin" ON employees FOR UPDATE
TO authenticated
USING (user_id = auth.uid() OR is_org_admin(organization_id))
WITH CHECK (user_id = auth.uid() OR is_org_admin(organization_id));

CREATE POLICY "delete_employees_self_or_admin" ON employees FOR DELETE
TO authenticated
USING (user_id = auth.uid() OR is_org_admin(organization_id));

/* ---------- job_names: admin-only writes ---------- */
DROP POLICY IF EXISTS "insert_org_job_names" ON job_names;
DROP POLICY IF EXISTS "update_org_job_names" ON job_names;
DROP POLICY IF EXISTS "delete_org_job_names" ON job_names;
DROP POLICY IF EXISTS "members_insert_job_names" ON job_names;
DROP POLICY IF EXISTS "members_update_job_names" ON job_names;
DROP POLICY IF EXISTS "members_delete_job_names" ON job_names;

CREATE POLICY "admin_insert_job_names" ON job_names FOR INSERT
TO authenticated WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "admin_update_job_names" ON job_names FOR UPDATE
TO authenticated
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "admin_delete_job_names" ON job_names FOR DELETE
TO authenticated
USING (is_org_admin(organization_id));

/* ---------- job_tickets: crew limited to their own tickets ---------- */
DROP POLICY IF EXISTS "update_org_job_tickets" ON job_tickets;
DROP POLICY IF EXISTS "delete_org_job_tickets" ON job_tickets;
DROP POLICY IF EXISTS "members_update_job_tickets" ON job_tickets;
DROP POLICY IF EXISTS "members_delete_job_tickets" ON job_tickets;

CREATE POLICY "update_own_tickets_or_admin" ON job_tickets FOR UPDATE
TO authenticated
USING (
  is_org_admin(organization_id)
  OR EXISTS (
    SELECT 1 FROM employees e
    WHERE e.user_id = auth.uid()
      AND e.name = job_tickets.created_by
  )
)
WITH CHECK (
  is_org_admin(organization_id)
  OR EXISTS (
    SELECT 1 FROM employees e
    WHERE e.user_id = auth.uid()
      AND e.name = job_tickets.created_by
  )
);

CREATE POLICY "delete_own_tickets_or_admin" ON job_tickets FOR DELETE
TO authenticated
USING (
  is_org_admin(organization_id)
  OR EXISTS (
    SELECT 1 FROM employees e
    WHERE e.user_id = auth.uid()
      AND e.name = job_tickets.created_by
  )
);

/* ---------- timeclock_entries: crew only their own punches ---------- */
DROP POLICY IF EXISTS "insert_org_timeclock_entries" ON timeclock_entries;
DROP POLICY IF EXISTS "update_org_timeclock_entries" ON timeclock_entries;
DROP POLICY IF EXISTS "delete_org_timeclock_entries" ON timeclock_entries;
DROP POLICY IF EXISTS "members_insert_timeclock" ON timeclock_entries;
DROP POLICY IF EXISTS "members_update_timeclock" ON timeclock_entries;
DROP POLICY IF EXISTS "members_delete_timeclock" ON timeclock_entries;

CREATE POLICY "insert_timeclock_own_or_admin" ON timeclock_entries FOR INSERT
TO authenticated
WITH CHECK (
  is_org_admin(organization_id)
  OR EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = timeclock_entries.employee_id
      AND e.user_id = auth.uid()
  )
);

CREATE POLICY "update_timeclock_own_or_admin" ON timeclock_entries FOR UPDATE
TO authenticated
USING (
  is_org_admin(organization_id)
  OR EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = timeclock_entries.employee_id
      AND e.user_id = auth.uid()
  )
)
WITH CHECK (
  is_org_admin(organization_id)
  OR EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = timeclock_entries.employee_id
      AND e.user_id = auth.uid()
  )
);

CREATE POLICY "delete_timeclock_own_or_admin" ON timeclock_entries FOR DELETE
TO authenticated
USING (
  is_org_admin(organization_id)
  OR EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = timeclock_entries.employee_id
      AND e.user_id = auth.uid()
  )
);

/* ---------- qb_exports: admin-only ---------- */
DROP POLICY IF EXISTS "insert_org_qb_exports" ON qb_exports;
DROP POLICY IF EXISTS "select_org_qb_exports" ON qb_exports;

CREATE POLICY "admin_insert_qb_exports" ON qb_exports FOR INSERT
TO authenticated WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "admin_select_qb_exports" ON qb_exports FOR SELECT
TO authenticated
USING (is_org_admin(organization_id));
