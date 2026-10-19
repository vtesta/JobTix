/*
# Add work week start day to organizations

1. Plain-English summary
   Every workspace has a "work week" used for weekly totals and weekly views.
   Until now this was hard-coded (tickets: week starting Sunday; timeclock: week starting Monday).
   This migration adds a per-organization setting so each workspace can pick which day its
   work week starts on. Existing workspaces keep their current behavior via defaults
   (the settings UI will show and change it going forward).

2. Modified tables
   - `organizations`: new column `work_week_start` (integer, 0 = Sunday ... 6 = Saturday).
     Defaults to 5 (Friday). A CHECK constraint keeps values in the 0-6 range.

3. Security
   - No RLS changes: the column lives on an existing table whose row level security
     and update policies already govern who can read and change it.

4. Notes
   - Idempotent: safe to re-run.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'work_week_start'
  ) THEN
    ALTER TABLE public.organizations
      ADD COLUMN work_week_start integer NOT NULL DEFAULT 5
      CONSTRAINT organizations_work_week_start_check CHECK (work_week_start >= 0 AND work_week_start <= 6);
  END IF;
END
$$;
