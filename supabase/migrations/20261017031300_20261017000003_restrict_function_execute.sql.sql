/*
# Restrict SECURITY DEFINER function execution to authenticated

## What this does
Revokes EXECUTE on the SECURITY DEFINER helper functions from the anon role
so unauthenticated callers cannot invoke them. The is_org_member and
is_org_admin functions are used internally by RLS policies (which run as the
caller's role), so they need to be executable by authenticated. claim_pending_
invites is called by the frontend after sign-in.

## Security
- REVOKE EXECUTE FROM anon on all four SECURITY DEFINER functions.
- GRANT EXECUTE TO authenticated only.
*/

REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_org_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_pending_invites() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;

GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_invites() TO authenticated;
