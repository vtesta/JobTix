/*
# Create job tickets storage

1. New Tables
- `job_tickets` stores the ticket details entered in the web app.
- `id` uniquely identifies each ticket.
- `job_name` stores the job title shown in the email.
- `job_date` stores the scheduled date.
- `recipients` stores one or more email addresses for the message.
- `names` stores the people listed on the ticket.
- `job_time` stores the scheduled time.
- `tasks` stores the work items.
- `materials` stores the materials list.
- `sent_at` records when the user launched the email.
- `created_at` records when the ticket was created.
2. Security
- Row level security is enabled.
- This is a shared, no-sign-in workspace, so the anon and authenticated roles receive separate CRUD policies.
3. Important Notes
- Ticket details are intentionally available to the shared company workspace.
- Email delivery uses the visitor's configured email application; `sent_at` records that the send action was launched.
*/

CREATE TABLE IF NOT EXISTS public.job_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  job_date date NOT NULL,
  recipients text[] NOT NULL DEFAULT '{}',
  names text[] NOT NULL DEFAULT '{}',
  job_time text NOT NULL DEFAULT '',
  tasks text[] NOT NULL DEFAULT '{}',
  materials text[] NOT NULL DEFAULT '{}',
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shared users can view job tickets" ON public.job_tickets;
CREATE POLICY "Shared users can view job tickets"
  ON public.job_tickets FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Shared users can create job tickets" ON public.job_tickets;
CREATE POLICY "Shared users can create job tickets"
  ON public.job_tickets FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Shared users can update job tickets" ON public.job_tickets;
CREATE POLICY "Shared users can update job tickets"
  ON public.job_tickets FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Shared users can delete job tickets" ON public.job_tickets;
CREATE POLICY "Shared users can delete job tickets"
  ON public.job_tickets FOR DELETE
  TO anon, authenticated
  USING (true);
