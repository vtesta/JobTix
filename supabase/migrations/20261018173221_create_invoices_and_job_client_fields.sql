/*
# Job reporting: client details on jobs + invoices from tickets

## 1. Why
The Jobs page is becoming a job reporting section. Jobs need client details
and a default labor rate so invoices can be drafted, and tickets need to be
combined into invoices.

## 2. New Tables
- `invoices` — one invoice per row, belonging to an organization.
  - `id` (uuid, primary key)
  - `organization_id` (uuid, references organizations, not null)
  - `job_name` (text, not null) — matches job_names.name / job_tickets.job_name
  - `invoice_number` (text, not null) — human-readable, e.g. INV-0001
  - `status` (text, not null, default 'draft') — one of draft, sent, paid, void
  - `client_name`, `client_email`, `client_phone` (text) — customer details
  - `issue_date` (date, not null, default today)
  - `due_date` (date, nullable)
  - `notes` (text) — notes shown on the invoice
  - `tax_rate_pct` (numeric, default 0) — percent, 0-100
  - `ticket_ids` (text[], default empty) — the tickets combined into this invoice
  - `sent_at`, `paid_at` (timestamptz, nullable)
  - `created_by` (text) — name of the team member who created it
  - `created_at`, `updated_at` (timestamptz)

- `invoice_line_items` — the lines on an invoice.
  - `id` (uuid, primary key)
  - `invoice_id` (uuid, references invoices, ON DELETE CASCADE, not null)
  - `organization_id` (uuid, references organizations, not null)
  - `kind` (text, not null) — 'labor' or 'material'
  - `description` (text, not null)
  - `ticket_ref` (text, nullable) — the ticket date/label the line came from
  - `quantity` (numeric, not null, default 1) — hours for labor, units for materials
  - `unit_price` (numeric, not null, default 0) — price per hour / per unit
  - `sort_index` (integer, default 0)
  - `created_at` (timestamptz)

## 3. Modified Tables
- `job_names` — new columns for reporting/invoicing context:
  - `client_name` (text, default '')
  - `client_email` (text, default '')
  - `client_phone` (text, default '')
  - `default_rate` (numeric, default 0) — default hourly rate used when
    drafting an invoice for this job
  - `notes` (text, default '') — free-form job notes

## 4. Security
- RLS enabled on both new tables.
- Read: any active member of the organization (same pattern as job_tickets).
- Write: only owners/admins via is_org_admin() — invoices are financial records.
- All policies are TO authenticated (this app has sign-in).

## 5. Notes
- invoice_number is unique per organization (enforced with a unique index).
- Line items cascade-delete with their invoice.
- A trigger keeps invoices.updated_at current on edits.
*/

/* ---------- job_names: client + rate fields ---------- */
ALTER TABLE public.job_names ADD COLUMN IF NOT EXISTS client_name text NOT NULL DEFAULT '';
ALTER TABLE public.job_names ADD COLUMN IF NOT EXISTS client_email text NOT NULL DEFAULT '';
ALTER TABLE public.job_names ADD COLUMN IF NOT EXISTS client_phone text NOT NULL DEFAULT '';
ALTER TABLE public.job_names ADD COLUMN IF NOT EXISTS default_rate numeric NOT NULL DEFAULT 0 CHECK (default_rate >= 0 AND default_rate <= 100000);
ALTER TABLE public.job_names ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';

/* ---------- invoices ---------- */
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_name text NOT NULL DEFAULT '',
  invoice_number text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'void')),
  client_name text NOT NULL DEFAULT '',
  client_email text NOT NULL DEFAULT '',
  client_phone text NOT NULL DEFAULT '',
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  notes text NOT NULL DEFAULT '',
  tax_rate_pct numeric NOT NULL DEFAULT 0 CHECK (tax_rate_pct >= 0 AND tax_rate_pct <= 100),
  ticket_ids text[] NOT NULL DEFAULT '{}'::text[],
  sent_at timestamptz,
  paid_at timestamptz,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_org_number_unique
  ON public.invoices (organization_id, invoice_number);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

/* ---------- invoice_line_items ---------- */
CREATE TABLE IF NOT EXISTS public.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'labor' CHECK (kind IN ('labor', 'material')),
  description text NOT NULL DEFAULT '',
  ticket_ref text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit_price numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  sort_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_line_items_invoice_idx
  ON public.invoice_line_items (invoice_id);

ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

/* ---------- policies: org members read, admins write ---------- */
DROP POLICY IF EXISTS "members_select_invoices" ON public.invoices;
CREATE POLICY "members_select_invoices" ON public.invoices FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.organization_id = invoices.organization_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  )
);

DROP POLICY IF EXISTS "admin_insert_invoices" ON public.invoices;
CREATE POLICY "admin_insert_invoices" ON public.invoices FOR INSERT
TO authenticated
WITH CHECK (is_org_admin(organization_id));

DROP POLICY IF EXISTS "admin_update_invoices" ON public.invoices;
CREATE POLICY "admin_update_invoices" ON public.invoices FOR UPDATE
TO authenticated
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

DROP POLICY IF EXISTS "admin_delete_invoices" ON public.invoices;
CREATE POLICY "admin_delete_invoices" ON public.invoices FOR DELETE
TO authenticated
USING (is_org_admin(organization_id));

DROP POLICY IF EXISTS "members_select_invoice_line_items" ON public.invoice_line_items;
CREATE POLICY "members_select_invoice_line_items" ON public.invoice_line_items FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.organization_id = invoice_line_items.organization_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  )
);

DROP POLICY IF EXISTS "admin_insert_invoice_line_items" ON public.invoice_line_items;
CREATE POLICY "admin_insert_invoice_line_items" ON public.invoice_line_items FOR INSERT
TO authenticated
WITH CHECK (is_org_admin(organization_id));

DROP POLICY IF EXISTS "admin_update_invoice_line_items" ON public.invoice_line_items;
CREATE POLICY "admin_update_invoice_line_items" ON public.invoice_line_items FOR UPDATE
TO authenticated
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

DROP POLICY IF EXISTS "admin_delete_invoice_line_items" ON public.invoice_line_items;
CREATE POLICY "admin_delete_invoice_line_items" ON public.invoice_line_items FOR DELETE
TO authenticated
USING (is_org_admin(organization_id));

/* ---------- updated_at trigger ---------- */
CREATE OR REPLACE FUNCTION public.touch_invoice_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_touch_updated_at ON public.invoices;
CREATE TRIGGER invoices_touch_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.touch_invoice_updated_at();
