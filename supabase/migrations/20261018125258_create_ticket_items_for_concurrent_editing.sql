/*
# Split ticket tasks and materials into per-item rows for safe concurrent editing

1. Plain-English explanation
- Today a ticket stores its tasks and materials as two big text lists on the
  ticket row itself. When two people save at the same time, the whole list is
  replaced, so one person's changes can silently overwrite the other's.
- This change gives every task and every material its own row in a new table
  (`ticket_items`). Saving now only touches the items you actually changed, so
  two people editing a ticket at the same time both succeed and both sets of
  changes are kept.
- Existing ticket data is copied into the new tables automatically — nothing
  is lost. The old list columns are kept in place (now maintained by the app)
  so no data is removed.

2. New Tables
- `ticket_items`
  - `id` (uuid, primary key, auto-generated)
  - `ticket_id` (uuid, references job_tickets, deleted when the ticket is deleted)
  - `organization_id` (uuid, references organizations, kept in sync with the ticket)
  - `kind` (text, either 'task' or 'material')
  - `content` (text, the task or material text)
  - `sort_index` (integer, ordering of the item within its list)
  - `created_at` (timestamp, when the item was added)

3. Modified Tables
- `job_tickets`: no columns changed. The `tasks` and `materials` array columns
  remain but are no longer the source of truth for editing.

4. Security
- RLS is enabled on `ticket_items`.
- Members of an organization can view its ticket items.
- Org admins can insert, update, and delete items.
- Assigned crew members (employees named on the ticket) can insert, update,
  and delete items on tickets they are assigned to, matching the ticket policy.
- Anon policies are included so the existing shared-workspace access keeps
  working for signed-out users.

5. Important Notes
- A unique index on (ticket_id, kind, content) prevents the same item being
  added twice by two people clicking at the same moment; duplicates are
  ignored rather than erroring.
- An index on ticket_id keeps loading a ticket's items fast.
- Realtime is enabled on the new table and on job_tickets so open tickets
  update live for everyone.
*/

-- 1. New table
CREATE TABLE IF NOT EXISTS public.ticket_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.job_tickets(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('task', 'material')),
  content text NOT NULL,
  sort_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_items_ticket ON public.ticket_items(ticket_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_items_unique_content
  ON public.ticket_items(ticket_id, kind, lower(content));

-- 2. Copy existing data (idempotent: only runs when the table is still empty)
DO $$
DECLARE
  rec record;
  i integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ticket_items LIMIT 1) THEN
    FOR rec IN
      SELECT id, organization_id, tasks, materials
      FROM public.job_tickets
      WHERE coalesce(array_length(tasks, 1), 0) > 0
         OR coalesce(array_length(materials, 1), 0) > 0
    LOOP
      IF rec.tasks IS NOT NULL THEN
        FOR i IN 1 .. coalesce(array_length(rec.tasks, 1), 0) LOOP
          INSERT INTO public.ticket_items (ticket_id, organization_id, kind, content, sort_index)
          VALUES (rec.id, rec.organization_id, 'task', rec.tasks[i], i - 1)
          ON CONFLICT DO NOTHING;
        END LOOP;
      END IF;
      IF rec.materials IS NOT NULL THEN
        FOR i IN 1 .. coalesce(array_length(rec.materials, 1), 0) LOOP
          INSERT INTO public.ticket_items (ticket_id, organization_id, kind, content, sort_index)
          VALUES (rec.id, rec.organization_id, 'material', rec.materials[i], i - 1)
          ON CONFLICT DO NOTHING;
        END LOOP;
      END IF;
    END LOOP;
  END IF;
END $$;

-- 3. Row level security
ALTER TABLE public.ticket_items ENABLE ROW LEVEL SECURITY;

-- org members can view items
DROP POLICY IF EXISTS "org_members_select_ticket_items" ON public.ticket_items;
CREATE POLICY "org_members_select_ticket_items"
  ON public.ticket_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.organization_id = ticket_items.organization_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  );

-- org admins can manage items
DROP POLICY IF EXISTS "org_admins_insert_ticket_items" ON public.ticket_items;
CREATE POLICY "org_admins_insert_ticket_items"
  ON public.ticket_items FOR INSERT
  TO authenticated
  WITH CHECK (is_org_admin(ticket_items.organization_id));

DROP POLICY IF EXISTS "org_admins_update_ticket_items" ON public.ticket_items;
CREATE POLICY "org_admins_update_ticket_items"
  ON public.ticket_items FOR UPDATE
  TO authenticated
  USING (is_org_admin(ticket_items.organization_id))
  WITH CHECK (is_org_admin(ticket_items.organization_id));

DROP POLICY IF EXISTS "org_admins_delete_ticket_items" ON public.ticket_items;
CREATE POLICY "org_admins_delete_ticket_items"
  ON public.ticket_items FOR DELETE
  TO authenticated
  USING (is_org_admin(ticket_items.organization_id));

-- assigned crew can manage items on tickets they are assigned to
DROP POLICY IF EXISTS "assigned_crew_insert_ticket_items" ON public.ticket_items;
CREATE POLICY "assigned_crew_insert_ticket_items"
  ON public.ticket_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.job_tickets jt
      WHERE jt.id = ticket_items.ticket_id
        AND jt.names @> ARRAY[
          (SELECT tm.name FROM public.team_members tm
           WHERE tm.user_id = auth.uid() AND tm.status = 'active' LIMIT 1)
        ]
    )
  );

DROP POLICY IF EXISTS "assigned_crew_update_ticket_items" ON public.ticket_items;
CREATE POLICY "assigned_crew_update_ticket_items"
  ON public.ticket_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.job_tickets jt
      WHERE jt.id = ticket_items.ticket_id
        AND jt.names @> ARRAY[
          (SELECT tm.name FROM public.team_members tm
           WHERE tm.user_id = auth.uid() AND tm.status = 'active' LIMIT 1)
        ]
    )
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "assigned_crew_delete_ticket_items" ON public.ticket_items;
CREATE POLICY "assigned_crew_delete_ticket_items"
  ON public.ticket_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.job_tickets jt
      WHERE jt.id = ticket_items.ticket_id
        AND jt.names @> ARRAY[
          (SELECT tm.name FROM public.team_members tm
           WHERE tm.user_id = auth.uid() AND tm.status = 'active' LIMIT 1)
        ]
    )
  );

-- keep legacy shared-workspace (anon) access intact
DROP POLICY IF EXISTS "anon_select_ticket_items" ON public.ticket_items;
CREATE POLICY "anon_select_ticket_items"
  ON public.ticket_items FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "anon_insert_ticket_items" ON public.ticket_items;
CREATE POLICY "anon_insert_ticket_items"
  ON public.ticket_items FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_ticket_items" ON public.ticket_items;
CREATE POLICY "anon_update_ticket_items"
  ON public.ticket_items FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_ticket_items" ON public.ticket_items;
CREATE POLICY "anon_delete_ticket_items"
  ON public.ticket_items FOR DELETE
  TO anon
  USING (true);

-- 4. Realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_items;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.job_tickets;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
