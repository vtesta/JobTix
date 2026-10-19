/*
# Stop auto-creating personal workspaces for crew accounts (regression fix)

## 1. Why
An earlier migration made the signup trigger skip creating a personal
workspace for crew accounts (internal @crewclock.access addresses created by
admins on the Team page). A later migration rewrote the trigger and dropped
that check. Result: every crew account was also given its own workspace with
an "owner" role, so the same person ended up with two memberships — owner of
their auto-workspace and employee of their employer's workspace. The app then
treated them as an admin.

## 2. What changes
- The signup trigger again skips auto-workspace creation for internal
  @crewclock.access addresses. These accounts get their membership row from
  the admin flow that created them.
- The pending-invite skip is unchanged.

## 3. Security
- Crew accounts can no longer gain an owner role through signup.
- Existing data: any stray auto-created workspaces for crew accounts should
  be removed separately; this migration prevents new ones.
*/

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

  -- If invited, skip auto-org creation — the invite will be claimed on first login
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE email = user_email
  ) INTO has_pending;
  IF has_pending THEN
    RETURN NEW;
  END IF;

  display_name := NULLIF(trim(coalesce(NEW.raw_user_meta_data->>'name', '')), '');
  IF display_name IS NULL THEN
    display_name := split_part(user_email, '@', 1);
  END IF;

  INSERT INTO public.organizations (name, default_recipient_email)
  VALUES (display_name || '''s Workspace', user_email)
  RETURNING id INTO new_org_id;

  INSERT INTO public.team_members (organization_id, user_id, email, name, role, status)
  VALUES (new_org_id, NEW.id, user_email, display_name, 'owner', 'active');

  RETURN NEW;
END;
$$;
