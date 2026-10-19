/*
# Link verified team members to employee records

## What this does
1. Adds a `user_id` column to `employees`, linking an employee row to the
   verified auth account (from auth.users) that owns it.
2. Backfills employee rows for every existing active team member so verified
   users immediately appear in the Employees list and can use the timeclock.
3. Extends `claim_pending_invites()` so that when an invited person signs up
   and their invite is claimed, a linked employee row is created automatically.
4. Extends `handle_new_user()` so that a brand-new (non-invited) signup — which
   auto-creates its own workspace — also gets a linked employee row.

## Modified tables
- `employees`
  - new column `user_id` (uuid, nullable, references auth.users).
  - One employee row per verified user per workspace (unique index).

## Security
- No new policies needed: existing employees policies still govern access.
- The trigger and claim function remain SECURITY DEFINER with search_path
  pinned to public.

## Important notes
- Unlinked (manually added, name-only) employees keep `user_id = NULL`.
- Removing the verified account unlinks the employee row but does not delete it.
*/

-- =========================================================
-- 1. Add user_id column + per-org uniqueness
-- =========================================================
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS employees_org_user_unique
  ON public.employees (organization_id, user_id)
  WHERE user_id IS NOT NULL;

-- =========================================================
-- 2. Backfill: create employee rows for existing verified members
-- =========================================================
INSERT INTO public.employees (name, organization_id, user_id)
SELECT tm.name, tm.organization_id, tm.user_id
FROM public.team_members tm
WHERE tm.status = 'active'
  AND tm.user_id IS NOT NULL
  AND tm.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.organization_id = tm.organization_id
      AND e.user_id = tm.user_id
  );

-- =========================================================
-- 3. claim_pending_invites — also create the linked employee row
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

  -- Make sure the verified member has an employee row in each of their workspaces
  INSERT INTO public.employees (name, organization_id, user_id)
  SELECT tm.name, tm.organization_id, auth.uid()
  FROM public.team_members tm
  WHERE tm.user_id = auth.uid()
    AND tm.status = 'active'
    AND tm.organization_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.organization_id = tm.organization_id
        AND e.user_id = auth.uid()
    );
END;
$$;

-- =========================================================
-- 4. handle_new_user — also create the linked employee row
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

  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE email = user_email
  ) INTO has_pending;

  IF has_pending THEN
    -- Invited: no auto-org. The employee row is created by
    -- claim_pending_invites() when the invite is claimed on first login.
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
