/*
# Track completed tickets

1. Plain-English explanation
- After a ticket is sent to the crew, the boss/admin can mark it as
  "completed" once the work is done and reviewed. This change adds a
  "completed" timestamp to every ticket, a way to see completed tickets
  between any two dates (not just this week), and a "Mark completed" button
  on submitted tickets.

2. Modified Tables
- `job_tickets`: new column `completed_at` (timestamp, empty by default).
  Empty means not completed yet. When the admin marks a ticket completed,
  the current time is recorded here.

3. Security
- No new tables. The existing update rules on `job_tickets` already control
  who can change a ticket; the app only shows the "Mark completed" action to
  admins, and the database rules still apply on top of that.

4. Important Notes
- Existing tickets are unaffected: their `completed_at` stays empty, meaning
  "not completed".
*/

ALTER TABLE public.job_tickets
ADD COLUMN IF NOT EXISTS completed_at timestamptz;
