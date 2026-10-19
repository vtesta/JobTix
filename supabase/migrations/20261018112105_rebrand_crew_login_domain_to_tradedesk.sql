/*
# Rebrand crew sign-in domain from crewclock.access to tradedesk.access

1. What this does (plain English)
   Crew accounts created by admins (e.g. "danr" with no email) are stored
   internally as `danr@crewclock.access`. That hidden "@crewclock" text leaks
   the old product name into the Team page and anywhere the internal address
   is shown. This migration renames the internal domain to
   `@tradedesk.access` for all NEW crew accounts, while every existing crew
   account on the old domain keeps signing in exactly as before.

2. Modified functions (no tables or columns change)
   - `lookup_crew_username(target_username text)` — used during sign-in to
     resolve a username to its internal account address. Now matches BOTH the
     new `@tradedesk.access` domain and the legacy `@crewclock.access`
     domain, so old and new crew accounts both work. Still SECURITY DEFINER
     with search_path pinned to public, still returns only an internal-domain
     email or null.
   - `handle_new_user()` — the signup trigger that gives new signups their own
     workspace. Its skip-rule (crew accounts must NOT get a personal
     workspace) now covers both the new and legacy internal domains.

3. Security
   - No RLS or policy changes. Both functions keep their existing grants:
     `lookup_crew_username` remains executable by anon + authenticated (it is
     needed before sign-in), and its EXECUTE grant for public stays revoked.
   - No destructive operations; no data is modified.

4. Important notes
   - Existing `@crewclock.access` accounts are intentionally left untouched.
     Rewriting their auth addresses would be risky; both domains are accepted
     everywhere instead.
   - The create-team-member edge function is updated in the same change to
     issue new addresses on the `tradedesk.access` domain.
*/

-- 1. Username lookup: accept new + legacy internal domains
CREATE OR REPLACE FUNCTION public.lookup_crew_username(target_username text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT tm.email
  FROM public.team_members tm
  WHERE tm.email = (
    SELECT lower(regexp_replace(COALESCE(target_username, ''), '[^a-z0-9A-Z]', '', 'g')) || d.domain
    FROM (VALUES ('@tradedesk.access'), ('@crewclock.access')) AS d(domain)
    LIMIT 1
    OFFSET 0
  )
  LIMIT 1;
$$;

-- Simpler + correct: match either domain explicitly
CREATE OR REPLACE FUNCTION public.lookup_crew_username(target_username text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT tm.email
  FROM public.team_members tm
  WHERE tm.email IN (
    lower(regexp_replace(COALESCE(target_username, ''), '[^a-z0-9A-Z]', '', 'g')) || '@tradedesk.access',
    lower(regexp_replace(COALESCE(target_username, ''), '[^a-z0-9A-Z]', '', 'g')) || '@crewclock.access'
  )
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.lookup_crew_username(text) FROM public;
GRANT EXECUTE ON FUNCTION public.lookup_crew_username(text) TO anon, authenticated;

-- 2. Signup trigger: skip auto-workspace for either internal domain
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

  -- Crew accounts created by the admin flow live on the internal domain and
  -- already have a team_members row; never give them their own workspace.
  IF user_email LIKE '%@tradedesk.access' OR user_email LIKE '%@crewclock.access' THEN
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
