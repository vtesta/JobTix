/*
# Security hardening: function privileges, search_path pinning, private-table policy

1. Function search path
- `public.sync_ticket_item_arrays` (trigger function): pin `SET search_path = ''` with
  fully-qualified names. Trigger functions are never callable over the API, so the
  advisor finding is about the mutable search_path itself.

2. Privilege tightening (all SECURITY DEFINER functions in `public`)
- `lookup_crew_username(target_username text)`: REVOKE EXECUTE from `anon`. It is only
  called at sign-in by an already-authenticated session (crew username lookup), so
  pre-login callers have no business calling it.
- `check_seat_available(target_org uuid)`: unused anywhere in the codebase (frontend,
  edge functions, policies) — dead code. Dropped entirely.
- `claim_pending_invites()`, `is_org_admin(target_org uuid)`, `is_org_member(target_org uuid)`,
  `upsert_invoice_memory(...)`: EXECUTE for `authenticated` stays INTENTIONAL.
  - claim_pending_invites: called by the app right after sign-in to link pending invites.
  - is_org_admin / is_org_member: called inside RLS policies on many tables; policies
    evaluate them as the calling role, so `authenticated` needs EXECUTE.
  - upsert_invoice_memory: called by the invoicing page to record prices; it validates
    kind and only upserts into the org's own learned price book.
  These are flagged by the generic linter rule but are by-design and remain scoped to
  `authenticated` (anon was already revoked in a prior migration).

3. Table `private.app_memory`
- RLS was enabled with zero policies (deny-all by design — access only via the
  service role from trusted code). To satisfy policy hygiene while keeping the
  deny-all behavior, add an explicit policy that matches nothing:
  `CREATE POLICY "deny_all_client_access" ... TO authenticated USING (false)`.
  Table grants for anon/authenticated were already revoked previously, so even the
  policy's `authenticated` scope can never reach rows; this policy is belt-and-suspenders.

## Security
- Least privilege on RPC surface: anon can no longer call lookup_crew_username.
- Dead SECURITY DEFINER function removed.
- Mutable search_path on trigger function removed.
- private.app_memory keeps deny-all posture, now with an explicit no-match policy.

## Important notes
- No data is lost; no schema changes other than dropping the unused function.
- App behavior unchanged: all actively used RPCs keep working for signed-in users.
*/

-- 1. Pin search_path on the trigger function (fully-qualified refs already in body)
CREATE OR REPLACE FUNCTION public.sync_ticket_item_arrays()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
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

-- 2. Revoke anon EXECUTE on the username lookup (sign-in flow is authenticated-only now)
REVOKE EXECUTE ON FUNCTION public.lookup_crew_username(text) FROM anon;

-- 3. Drop the dead seat-check function (unused by app, edge functions, and policies)
DROP FUNCTION IF EXISTS public.check_seat_available(uuid);

-- 4. Explicit deny-all policy on the private memory store
DROP POLICY IF EXISTS "deny_all_client_access" ON private.app_memory;
CREATE POLICY "deny_all_client_access"
ON private.app_memory
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);
