-- Owner records must use the name entered at signup, not the email prefix.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  -- Prefer the name entered at signup; fall back to the email prefix.
  display_name := NULLIF(trim(coalesce(NEW.raw_user_meta_data->>'name', '')), '');
  IF display_name IS NULL THEN
    display_name := split_part(user_email, '@', 1);
  END IF;

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

-- Backfill: repair existing records that were named from the email prefix.
WITH renamed AS (
  SELECT
    u.id AS user_id,
    trim(u.raw_user_meta_data->>'name') AS display_name,
    u.email AS user_email
  FROM auth.users u
  WHERE NULLIF(trim(coalesce(u.raw_user_meta_data->>'name', '')), '') IS NOT NULL
)
UPDATE public.team_members tm
SET name = r.display_name
FROM renamed r
WHERE tm.user_id = r.user_id
  AND tm.name = split_part(r.user_email, '@', 1)
  AND tm.name <> r.display_name;

WITH renamed AS (
  SELECT
    u.id AS user_id,
    trim(u.raw_user_meta_data->>'name') AS display_name,
    u.email AS user_email
  FROM auth.users u
  WHERE NULLIF(trim(coalesce(u.raw_user_meta_data->>'name', '')), '') IS NOT NULL
)
UPDATE public.organizations o
SET name = r.display_name || '''s Workspace'
FROM renamed r
WHERE o.id IN (
  SELECT tm.organization_id FROM public.team_members tm WHERE tm.user_id = r.user_id
)
  AND o.name = split_part(r.user_email, '@', 1) || '''s Workspace'
  AND o.name <> r.display_name || '''s Workspace';

WITH renamed AS (
  SELECT
    u.id AS user_id,
    trim(u.raw_user_meta_data->>'name') AS display_name
  FROM auth.users u
  WHERE NULLIF(trim(coalesce(u.raw_user_meta_data->>'name', '')), '') IS NOT NULL
)
UPDATE public.employees e
SET name = r.display_name
FROM renamed r
WHERE e.user_id = r.user_id
  AND e.name <> r.display_name;
