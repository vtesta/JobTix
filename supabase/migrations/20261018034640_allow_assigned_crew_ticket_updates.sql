/*
# Allow assigned crew members to contribute to their tickets

## 1. Why
Job ticket update policies only allowed organization admins or the ticket's
creator (matching created_by) to edit a ticket. When a ticket is created with
crew names, those crew members could see the ticket but could not add their
own tasks or materials to it.

## 2. What changes
- Adds an UPDATE policy on job_tickets: any active member of the organization
  who is linked (via the employees table) to a name listed in the ticket's
  crew (names array) can update that ticket. The UI continues to restrict
  which fields crew can edit; this policy is the database-level permission.
- Read access is unchanged: org members could already see all org tickets.

## 3. Security
- The new policy uses auth.uid() linked to the employees table, so only
  verified, linked crew members qualify. Unlinked name-only employees are
  not matched.
- WITH CHECK mirrors the USING predicate, so a crew member cannot modify a
  ticket in a way that would remove their own eligibility (e.g. removing
  their name from the crew list) or move the ticket to another organization.
- Admins and creators keep their existing policies; nothing is dropped.
*/

DROP POLICY IF EXISTS "update_assigned_crew_tickets" ON public.job_tickets;

CREATE POLICY "update_assigned_crew_tickets" ON public.job_tickets FOR UPDATE
TO authenticated
USING (
  is_org_member(organization_id)
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.user_id = auth.uid()
      AND e.name = ANY (job_tickets.names)
  )
)
WITH CHECK (
  is_org_member(organization_id)
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.user_id = auth.uid()
      AND e.name = ANY (job_tickets.names)
  )
);
