/*
# Lock down SECURITY DEFINER function execution

## Why
Postgres grants EXECUTE to PUBLIC on every function by default. An earlier
migration revoked from anon only, so the functions stayed callable through the
default PUBLIC grant. This re-applies the lockdown correctly.

## What changes
- Revoke EXECUTE from PUBLIC and anon on all SECURITY DEFINER helpers.
- lookup_crew_username stays callable by anon + authenticated (needed during
  sign-in, before a session exists).
- claim_pending_invites, is_org_member, is_org_admin, check_seat_available are
  granted to authenticated only.
- handle_new_user is an auth trigger; no role gets direct EXECUTE.

## Security
- Unauthenticated callers can no longer invoke seat checks, invite claims, or
  the org membership helpers through the REST API.
*/

REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_pending_invites() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_seat_available(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lookup_crew_username(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_invites() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_seat_available(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_crew_username(text) TO anon, authenticated;
