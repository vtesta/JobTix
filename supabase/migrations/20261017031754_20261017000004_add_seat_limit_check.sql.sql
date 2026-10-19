/*
# Add seat-limit enforcement function

## What this does
Adds a SECURITY DEFINER function `check_seat_available(target_org uuid)` that
returns true if the org has not exceeded its seat_limit. Used by the frontend
to block new invitations when the plan's seat limit is reached.

## Security
- SECURITY DEFINER, executable by authenticated only.
- Counts active team_members for the org and compares to organizations.seat_limit.
*/

CREATE OR REPLACE FUNCTION public.check_seat_available(target_org uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT (
    SELECT COALESCE(seat_limit, 3) FROM public.organizations WHERE id = target_org
  ) > (
    SELECT COUNT(*)::int FROM public.team_members
    WHERE organization_id = target_org
      AND status = 'active'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.check_seat_available(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_seat_available(uuid) TO authenticated;
