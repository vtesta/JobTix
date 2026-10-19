-- Use the name entered at signup for the owner and workspace records,
-- falling back to the email prefix when no name was provided.

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
