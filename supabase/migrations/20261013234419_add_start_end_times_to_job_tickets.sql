/*
# Add separate start and end times to job tickets

1. Modified Tables
- `job_tickets.start_time` stores the scheduled start time as a time input value.
- `job_tickets.end_time` stores the scheduled end time as a time input value.
- Existing ticket data is preserved; both new fields default to an empty value for older tickets.
2. Security
- The existing row-level security configuration and shared CRUD policies remain unchanged.
3. Important Notes
- The original `job_time` column is retained to avoid data loss for previously stored tickets.
- New and edited tickets use the separate start and end time fields.
*/

ALTER TABLE public.job_tickets
  ADD COLUMN IF NOT EXISTS start_time text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS end_time text NOT NULL DEFAULT '';
