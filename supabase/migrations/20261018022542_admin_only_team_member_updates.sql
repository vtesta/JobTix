/*
# Only admins may change team member roles

## 1. Why
The update policy on team_members allowed members to update their own row.
A crew member could therefore set their own role to "owner" and gain full
admin powers — a self-promotion hole.

## 2. What changes
- Replaces the combined update policy with an admin-only one: only owners and
  admins of the workspace can update member rows (role, status, name).
- Members can still see their own membership (unchanged read policy).
- Nothing in the app relies on members editing their own row; sign-in flows
  that update membership status run through trusted server-side functions.

## 3. Security
- Closes the self-promotion escalation path.
*/

DROP POLICY IF EXISTS "update_team_members" ON team_members;

CREATE POLICY "admin_update_team_members" ON team_members FOR UPDATE
TO authenticated
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));
