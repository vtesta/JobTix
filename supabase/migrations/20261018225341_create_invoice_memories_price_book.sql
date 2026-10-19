/*
# Add invoice memory: learn pricing from saved invoices

## 1. Why
Invoice building was repetitive: pulling a task from a ticket started every
price at zero (or a flat job default), the AI guessed prices from scratch
every time, and nothing remembered what the business actually charged last
time for identical work. This table gives the app a private, per-organization
"price book" learned from real, saved invoices.

## 2. What changes
- New table `invoice_memories`:
  - `id` (uuid, primary key, auto-generated)
  - `organization_id` (uuid, not null, FK -> organizations ON DELETE CASCADE)
  - `kind` (text, 'labor' or 'material') — line type
  - `description` (text, not null) — the billed line description (match key)
  - `unit_price` (numeric, not null) — the price actually saved on an invoice
  - `quantity` (numeric, not null) — the quantity actually billed
  - `usage_count` (integer, not null, default 1) — how many saves used it
  - `last_used_at` (timestamptz, not null, default now()) — recency, for ranking
  - `created_at` (timestamptz, default now())
- Unique index on (organization_id, kind, lower(description)): one row per
  item per org; repeats bump usage_count and refresh the price in place.
- Index on (organization_id, last_used_at DESC) for fast suggestion queries.
- New SECURITY DEFINER function `upsert_invoice_memory(org, kind, description,
  unit_price, quantity)`: normalizes whitespace, skips junk descriptions,
  skips $0 labor rows, and either inserts the item or updates it to the newly
  saved price and bumps usage_count (most recent price wins).

## 3. Security
- RLS enabled on invoice_memories.
- Select: any active org member (is_org_member) — matches invoices read rules.
- Insert/update/delete: only owners/admins via is_org_admin() — learned
  pricing is financial data, matching the invoices write rules.
- The upsert function is SECURITY DEFINER with pinned search_path, EXECUTE
  revoked from public/anon and granted to authenticated.

## 4. Notes
- Recording happens after a successful invoice save (one call per distinct
  line), so memory reflects what was ACTUALLY saved, including edits and
  accepted AI-drafted lines. Raw invoices are never modified or deleted.
*/

CREATE TABLE IF NOT EXISTS public.invoice_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('labor', 'material')),
  description text NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  quantity numeric NOT NULL DEFAULT 1,
  usage_count integer NOT NULL DEFAULT 1,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS invoice_memories_org_kind_desc_key
  ON public.invoice_memories (organization_id, kind, lower(description));

CREATE INDEX IF NOT EXISTS invoice_memories_org_recent_idx
  ON public.invoice_memories (organization_id, last_used_at DESC);

CREATE OR REPLACE FUNCTION public.upsert_invoice_memory(
  p_org uuid,
  p_kind text,
  p_description text,
  p_unit_price numeric,
  p_quantity numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_desc text;
BEGIN
  clean_desc := trim(regexp_replace(coalesce(p_description, ''), '\s+', ' ', 'g'));
  IF clean_desc = '' OR clean_desc = '-' OR clean_desc = '—' THEN
    RETURN;
  END IF;
  IF p_kind NOT IN ('labor', 'material') THEN
    RETURN;
  END IF;
  -- Labor with no price carries no useful memory.
  IF p_kind = 'labor' AND coalesce(p_unit_price, 0) <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.invoice_memories
    (organization_id, kind, description, unit_price, quantity)
  VALUES
    (p_org, p_kind, clean_desc, coalesce(p_unit_price, 0), greatest(coalesce(p_quantity, 1), 0))
  ON CONFLICT (organization_id, kind, lower(description)) DO UPDATE
    SET unit_price = EXCLUDED.unit_price,
        quantity = EXCLUDED.quantity,
        usage_count = invoice_memories.usage_count + 1,
        last_used_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_invoice_memory(uuid, text, text, numeric, numeric) FROM public;
REVOKE ALL ON FUNCTION public.upsert_invoice_memory(uuid, text, text, numeric, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_invoice_memory(uuid, text, text, numeric, numeric) TO authenticated;

ALTER TABLE public.invoice_memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_select_invoice_memories" ON public.invoice_memories;
CREATE POLICY "members_select_invoice_memories" ON public.invoice_memories FOR SELECT
TO authenticated
USING (is_org_member(organization_id));

DROP POLICY IF EXISTS "admin_insert_invoice_memories" ON public.invoice_memories;
CREATE POLICY "admin_insert_invoice_memories" ON public.invoice_memories FOR INSERT
TO authenticated
WITH CHECK (is_org_admin(organization_id));

DROP POLICY IF EXISTS "admin_update_invoice_memories" ON public.invoice_memories;
CREATE POLICY "admin_update_invoice_memories" ON public.invoice_memories FOR UPDATE
TO authenticated
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

DROP POLICY IF EXISTS "admin_delete_invoice_memories" ON public.invoice_memories;
CREATE POLICY "admin_delete_invoice_memories" ON public.invoice_memories FOR DELETE
TO authenticated
USING (is_org_admin(organization_id));
