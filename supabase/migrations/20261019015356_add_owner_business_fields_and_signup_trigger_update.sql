/*
# Owner accounts: collect business info at signup + secure email-code login support

1. Why
- Business owners sign up for the workspace; we now collect their business
  phone, industry, and team size during signup so the workspace is prefilled
  correctly and we know who runs it.
- Owner sign-in moves to an email verification code (one-time code). Crew
  username + password sign-in is unchanged.

2. Modified Tables
- `organizations`
  - `business_phone` (text, null) — owner's business phone number.
  - `industry` (text, null) — trade the business works in.
  - `company_size` (text, null) — rough crew size band chosen at signup.

3. Modified Functions
- `handle_new_user()` — unchanged behavior for crew/invited accounts, but when
  a real owner signs up it now uses the collected business name for the
  workspace name (falling back to the old email-derived name) and records the
  business phone, industry, and team size on the new organization.

4. Security
- RLS unchanged: organization rows remain visible only to their members.
- The trigger stays SECURITY DEFINER with a pinned search_path and still skips
  internal crew accounts and invited users.

5. Notes
- Idempotent: safe to re-run.
*/

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS business_phone text,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS company_size text;

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
  business_name text;
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

  -- Owners: prefer the business name collected at signup for the workspace.
  business_name := NULLIF(trim(coalesce(NEW.raw_user_meta_data->>'business_name', '')), '');
  display_name := NULLIF(trim(coalesce(NEW.raw_user_meta_data->>'name', '')), '');
  IF display_name IS NULL THEN
    display_name := split_part(user_email, '@', 1);
  END IF;

  INSERT INTO public.organizations (
    name,
    default_recipient_email,
    business_phone,
    industry,
    company_size
  )
  VALUES (
    coalesce(business_name, display_name || '''s Workspace'),
    user_email,
    NULLIF(trim(coalesce(NEW.raw_user_meta_data->>'business_phone', '')), ''),
    NULLIF(trim(coalesce(NEW.raw_user_meta_data->>'industry', '')), ''),
    NULLIF(trim(coalesce(NEW.raw_user_meta_data->>'company_size', '')), '')
  )
  RETURNING id INTO new_org_id;

  INSERT INTO public.team_members (organization_id, user_id, email, name, role, status)
  VALUES (new_org_id, NEW.id, user_email, display_name, 'owner', 'active');

  RETURN NEW;
END;
$$;
