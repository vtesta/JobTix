/*
# Let crew members add job names from the ticket form

## 1. Why
Job names were admin-only writes. To keep ticketing seamless, crew members
should be able to add a missing job name while filling out a ticket —
without getting the full admin Jobs page (delete, rename, export).

## 2. What changes
- Adds a member-level INSERT policy on job_names for active members of the
  organization. Update and delete stay admin-only, so crew can add a job but
  never modify or remove existing ones.
- Prevents duplicate job names within the same organization via a case-
  insensitive unique index; the form already checks this before insert.

## 3. Security
- Scope: active members of the org only (is_org_member), no admin rights.
- No other write paths change.
*/

CREATE POLICY "member_insert_job_names" ON job_names FOR INSERT
TO authenticated WITH CHECK (is_org_member(organization_id));

CREATE UNIQUE INDEX IF NOT EXISTS job_names_org_name_lower_key
ON job_names (organization_id, lower(name));
