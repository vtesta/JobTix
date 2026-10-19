/*
# Keep ticket task/material lists auto-synced with the new per-item rows

1. Plain-English explanation
- The previous change gave every task and material its own row in the
  `ticket_items` table so two people can edit a ticket at the same time
  without overwriting each other.
- Other parts of the app (CSV export, email text, search, task counts) still
  read the two list columns on the ticket itself. This change adds an
  automatic sync: whenever an item is added, changed, or removed, the lists on
  the ticket are rebuilt from the per-item rows, so every reader stays up to
  date and no list ever goes stale.

2. New Functions
- `sync_ticket_item_arrays()`: internal database routine that rebuilds a
  ticket's task and material lists from `ticket_items`. Runs automatically
  after any change to `ticket_items`.

3. Modified Tables
- `job_tickets`: the `tasks` and `materials` columns are now maintained
  automatically from `ticket_items`. No column changes.

4. Security
- No policy changes. The sync routine runs with the permissions of the person
  making the change, and existing update rules on `job_tickets` already allow
  it.

5. Important Notes
- A one-time rebuild refreshes all existing tickets so lists match the
  migrated items exactly.
- Realtime publication already includes `ticket_items` and `job_tickets`.
*/

CREATE OR REPLACE FUNCTION public.sync_ticket_item_arrays() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tid uuid := coalesce(NEW.ticket_id, OLD.ticket_id);
BEGIN
  UPDATE public.job_tickets jt
  SET tasks = coalesce(
        array(
          SELECT ti.content FROM public.ticket_items ti
          WHERE ti.ticket_id = tid AND ti.kind = 'task'
          ORDER BY ti.sort_index, ti.created_at
        ),
        '{}'::text[]
      ),
      materials = coalesce(
        array(
          SELECT ti.content FROM public.ticket_items ti
          WHERE ti.ticket_id = tid AND ti.kind = 'material'
          ORDER BY ti.sort_index, ti.created_at
        ),
        '{}'::text[]
      )
  WHERE jt.id = tid;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sync_ticket_item_arrays ON public.ticket_items;
CREATE TRIGGER trg_sync_ticket_item_arrays
  AFTER INSERT OR UPDATE OR DELETE ON public.ticket_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_ticket_item_arrays();

-- One-time rebuild so existing lists match the migrated items exactly
UPDATE public.job_tickets jt
SET tasks = coalesce(
      array(
        SELECT ti.content FROM public.ticket_items ti
        WHERE ti.ticket_id = jt.id AND ti.kind = 'task'
        ORDER BY ti.sort_index, ti.created_at
      ),
      '{}'::text[]
    ),
    materials = coalesce(
      array(
        SELECT ti.content FROM public.ticket_items ti
        WHERE ti.ticket_id = jt.id AND ti.kind = 'material'
        ORDER BY ti.sort_index, ti.created_at
      ),
      '{}'::text[]
    );
