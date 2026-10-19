/*
# Cap trial workspaces at 3 seats (matches lowest paid plan)

## 1. Why
New workspaces were provisioned with the default seat_limit of 5, but the
lowest paid plan (solo) only allows 3 team members. Someone could add 5
employees during the free trial and keep them after subscribing to the
lowest tier, effectively getting 2 free seats.

## 2. What changes
- organizations.seat_limit default changes from 5 to 3, so every new
  workspace starts at 3 seats until it subscribes to a paid plan.
- Backfill: existing workspaces still on trial (subscription_status =
  'trialing') with seat_limit above 3 are lowered to 3. Paid workspaces
  (active, past_due, canceled handled by billing) keep their plan limits.
- No columns are added, removed, or retyped; no data loss.

## 3. Security
- No policy changes. Seat enforcement continues via the create-team-member
  edge function, which now consistently sees the 3-seat trial cap.

## 4. Notes
- Workspaces that already subscribed keep whatever limit their plan set
  (solo 3, team 15, business 50), so no paying customer is affected.
*/

ALTER TABLE public.organizations
  ALTER COLUMN seat_limit SET DEFAULT 3;

UPDATE public.organizations
SET seat_limit = 3
WHERE subscription_status = 'trialing'
  AND seat_limit > 3;
