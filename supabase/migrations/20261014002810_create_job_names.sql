/*
# Create job names table

1. New Tables
- `job_names` stores reusable job names for the "Current Jobs" page and the ticket form dropdown.
- `id` uniquely identifies each job name.
- `name` stores the job name text (unique, not null).
- `created_at` records when the job name was added.
2. Security
- Row level security is enabled.
- This is a shared, no-sign-in workspace, so the anon and authenticated roles receive separate CRUD policies.
3. Important Notes
- Job names are intentionally available to the shared company workspace.
- The ticket form dropdown reads from this table so the user can quickly select or add a job name.
*/

CREATE TABLE IF NOT EXISTS public.job_names (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_names ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shared users can view job names" ON public.job_names;
CREATE POLICY "Shared users can view job names"
  ON public.job_names FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Shared users can create job names" ON public.job_names;
CREATE POLICY "Shared users can create job names"
  ON public.job_names FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Shared users can update job names" ON public.job_names;
CREATE POLICY "Shared users can update job names"
  ON public.job_names FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Shared users can delete job names" ON public.job_names;
CREATE POLICY "Shared users can delete job names"
  ON public.job_names FOR DELETE
  TO anon, authenticated
  USING (true);
