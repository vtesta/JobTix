/*
# Auto-provision org on signup + invite-claim function

## What this does
1. When a brand-new user signs up (no pending invites), automatically creates
   an organization with the user's email-derived name and makes them the owner.
   This gives every new employer a workspace on first signup without a separate
   onboarding step.
2. Provides a SECURITY DEFINER function `claim_pending_invites()` that runs on
   login/signup: it finds team_members rows matching the user's email with
   status='pending' and links them to the user_id, marking status='active'.

## New functions
- `handle_new_user()` — trigger function on auth.users INSERT. Creates org +
  owner team_member only if no pending invites exist for the email.
- `claim_pending_invites()` — SECURITY DEFINER, callable by authenticated
  users. Links pending team_members with matching email to auth.uid().

## Security
- The trigger runs as SECURITY DEFINER with search_path pinned to public.
- `claim_pending_invites` is SECURITY DEFINER and only updates rows where
  email matches the caller's auth email and status='pending'.

## Important notes
- The org name defaults to the part before '@' in the email; the user can
  rename it later in org settings.
- If the user was invited to an existing org first, no auto-org is created —
  the invite claim path links them to the existing org instead.
*/

-- =========================================================
-- 1. claim_pending_invites — link pending invites to auth user
-- =========================================================
CREATE OR REPLACE FUNCTION public.claim_pending_invites()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email text;
BEGIN
  caller_email := (
    SELECT email FROM auth.users WHERE id = auth.uid()
  );
  IF caller_email IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.team_members
    SET user_id = auth.uid(),
        status = 'active'
    WHERE email = caller_email
      AND status = 'pending'
      AND user_id IS NULL;
END;
$$;

-- =========================================================
-- 2. handle_new_user — auto-create org for users with no invites
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

  -- Check if this email has any pending invites
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE email = user_email
  ) INTO has_pending;

  -- If invited, skip auto-org creation — the invite will be claimed on first login
  IF has_pending THEN
    RETURN NEW;
  END IF;

  -- No invites → create a new org and make this user the owner
  display_name := split_part(user_email, '@', 1);

  INSERT INTO public.organizations (name, default_recipient_email)
  VALUES (display_name || '''s Workspace', user_email)
  RETURNING id INTO new_org_id;

  INSERT INTO public.team_members (organization_id, user_id, email, name, role, status)
  VALUES (new_org_id, NEW.id, user_email, display_name, 'owner', 'active');

  RETURN NEW;
END;
$$;

-- =========================================================
-- 3. Trigger on auth.users
-- =========================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
