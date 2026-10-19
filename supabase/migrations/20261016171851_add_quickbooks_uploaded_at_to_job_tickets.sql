/*
# Add quickbooks_uploaded_at column to job_tickets

1. Changes
- Adds `quickbooks_uploaded_at` (timestamptz, nullable) to `job_tickets`.
- When non-null, the ticket has been included in a QuickBooks export file.
- No new tables. No security changes — RLS is already enabled with anon/authenticated policies.
2. Important notes
- The column is nullable so existing tickets default to "not uploaded."
- No data is lost — this is a purely additive column addition.
*/

ALTER TABLE job_tickets
  ADD COLUMN IF NOT EXISTS quickbooks_uploaded_at timestamptz;