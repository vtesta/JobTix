/*
# Dispatch: job assignments + in-app notifications

1. New Tables
- `job_assignments` — links a ticket to a team member (the crew assignment).
  - `id` (uuid, primary key)
  - `organization_id` (uuid, not null, FK organizations, on delete cascade)
  - `ticket_id` (uuid, not null, FK job_tickets, on delete cascade)
  - `team_member_id` (uuid, not null, FK team_members, on delete cascade)
  - `status` (text, not null, default 'assigned') — 'assigned' | 'acknowledged'
  - `assigned_by` (text) — display name of the dispatcher
  - `created_at` (timestamptz, default now())
  - `acknowledged_at` (timestamptz, null until crew marks it seen)
  - UNIQUE (ticket_id, team_member_id) — one assignment per person per ticket
- `notifications` — in-app alerts for crew members.
  - `id` (uuid, primary key)
  - `organization_id` (uuid, not null, FK organizations, on delete cascade)
  - `user_id` (uuid, not null, FK auth.users, on delete cascade) — the recipient
  - `kind` (text, not null, default 'assignment')
  - `title` (text, not null)
  - `body` (text, not null, default '')
  - `ticket_id` (uuid, null) — jump target
  - `read_at` (timestamptz, null until read)
  - `created_at` (timestamptz, default now())

2. Security
- RLS enabled on both tables.
- job_assignments:
  - admins (owner/admin) full CRUD on their org's rows
  - crew can SELECT and UPDATE (acknowledge) only their own rows
- notifications:
  - recipients read/update (mark read) their own
  - admins can insert (dispatch creates alerts) and delete org rows

3. Realtime
- Both tables added to the supabase_realtime publication so the app
  receives live updates without polling.
*/

CREATE TABLE IF NOT EXISTS public.job_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.job_tickets(id) ON DELETE CASCADE,
  team_member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'acknowledged')),
  assigned_by text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  UNIQUE (ticket_id, team_member_id)
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'assignment',
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  ticket_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_assignments_ticket ON public.job_assignments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_job_assignments_member ON public.job_assignments(team_member_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.job_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- job_assignments: admins manage org-wide, crew see only their own
DROP POLICY IF EXISTS "select_assignments_admin_or_own" ON public.job_assignments;
CREATE POLICY "select_assignments_admin_or_own" ON public.job_assignments
  FOR SELECT TO authenticated
  USING (
    is_org_admin(organization_id)
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.id = job_assignments.team_member_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "insert_assignments_admin" ON public.job_assignments;
CREATE POLICY "insert_assignments_admin" ON public.job_assignments
  FOR INSERT TO authenticated
  WITH CHECK (is_org_admin(organization_id));

DROP POLICY IF EXISTS "update_assignments_admin_or_own" ON public.job_assignments;
CREATE POLICY "update_assignments_admin_or_own" ON public.job_assignments
  FOR UPDATE TO authenticated
  USING (
    is_org_admin(organization_id)
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.id = job_assignments.team_member_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  )
  WITH CHECK (
    is_org_admin(organization_id)
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.id = job_assignments.team_member_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "delete_assignments_admin" ON public.job_assignments;
CREATE POLICY "delete_assignments_admin" ON public.job_assignments
  FOR DELETE TO authenticated
  USING (is_org_admin(organization_id));

-- notifications: own rows for crew; admins insert and clean up
DROP POLICY IF EXISTS "select_own_notifications" ON public.notifications;
CREATE POLICY "select_own_notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "insert_notifications_admin" ON public.notifications;
CREATE POLICY "insert_notifications_admin" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    is_org_admin(organization_id)
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "update_own_notifications" ON public.notifications;
CREATE POLICY "update_own_notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "delete_notifications_admin_or_own" ON public.notifications;
CREATE POLICY "delete_notifications_admin_or_own" ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR is_org_admin(organization_id));

-- Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.job_assignments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
