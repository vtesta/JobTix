/*
# Crew-username sign-in support (no-email team accounts)

## What this does
The app now creates team member accounts directly on screen — no invite emails.
Each account gets an internal address `<username>@crewclock.access`. This
migration makes username sign-in work for those accounts.

1. Adds a SECURITY DEFINER function `lookup_crew_username(username)` that
   resolves a crew username to its internal account email. SECURITY DEFINER is
   required because a signed-out person (anon role) has no other way to look
   up the internal address during sign-in, and team_members RLS only lets
   workspace admins read member rows. It returns the internal email only for
   real crew accounts (internal domain) and never leaks other data.
2. Updates `handle_new_user()` so accounts created for crew members (internal
   domain) do NOT auto-create a personal workspace — only real signups (work
   emails) get one. Crew accounts join their employer's workspace via the
   team_members row the admin flow already inserts.

## New functions
- `lookup_crew_username(target_username text)` → text (internal email or null)

## Modified functions
- `handle_new_user()` — skip org auto-creation for crew internal addresses.

## Security
- `lookup_crew_username` is SECURITY DEFINER, search_path pinned to public,
  EXECUTE granted to anon + authenticated (needed pre-sign-in), returns only
  an internal-domain email, null for unknown usernames, and never exposes
  passwords or other member data.
- The trigger stays SECURITY DEFINER with search_path pinned to public.

## Important notes
- Any team_members row whose email is not on the internal domain is treated as
  a normal signup and keeps existing behavior (auto workspace on signup).
- Existing pending invite rows still work through the existing claim flow.
*/

-- =========================================================
-- 1. Username → internal email lookup for sign-in
-- =========================================================
CREATE OR REPLACE FUNCTION public.lookup_crew_username(target_username text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT tm.email
  FROM public.team_members tm
  WHERE tm.email = lower(
    regexp_replace(COALESCE(target_username, ''), '[^a-z0-9A-Z]', '', 'g')
  ) || '@crewclock.access'
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.lookup_crew_username(text) FROM public;
GRANT EXECUTE ON FUNCTION public.lookup_crew_username(text) TO anon, authenticated;

-- =========================================================
-- 2. Skip auto-workspace for crew internal accounts
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email text;
  has_pending boolean;
  new_org_id uuid;
  display_name text;
BEGIN
  user_email := NEW.email;

  IF user_email IS NULL THEN
    RETURN NEW;
  END IF;

  -- Crew accounts created by the admin flow are on the internal domain and
  -- already have a team_members row; never give them their own workspace.
  IF user_email LIKE '%@crewclock.access' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE email = user_email
  ) INTO has_pending;

  IF has_pending THEN
    RETURN NEW;
  END IF;

  display_name := split_part(user_email, '@', 1);

  INSERT INTO public.organizations (name, default_recipient_email)
  VALUES (display_name || '''s Workspace', user_email)
  RETURNING id INTO new_org_id;

  INSERT INTO public.team_members (organization_id, user_id, email, name, role, status)
  VALUES (new_org_id, NEW.id, user_email, display_name, 'owner', 'active');

  INSERT INTO public.employees (name, organization_id, user_id)
  VALUES (display_name, new_org_id, NEW.id);

  RETURN NEW;
END;
$$;
