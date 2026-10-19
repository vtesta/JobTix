/*
# Link invoice line items to their source tickets

## 1. Why
The new invoicing module lets admins pull specific tasks and materials from a
ticket into an invoice. To keep the ticket list truthful ("Invoiced" badges,
double-billing prevention), each invoice line needs a direct reference back to
the ticket it came from.

## 2. Modified Tables
- `invoice_line_items`
  - `ticket_id` (uuid, nullable) — the job ticket this line was pulled from.
    Nullable because hand-added lines and merged material lines may not map to
    a single ticket. Set to NULL automatically if the source ticket is deleted.

## 3. Security
- No policy changes: the column adds no new access paths. Existing RLS on
  `invoice_line_items` (members read, admins write) already covers it.

## 4. Notes
- Index added on `ticket_id` for fast "which invoice claims this ticket" lookups.
- Idempotent: safe to re-run.
*/

ALTER TABLE public.invoice_line_items
  ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.job_tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS invoice_line_items_ticket_idx
  ON public.invoice_line_items (ticket_id);
