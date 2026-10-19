/*
# Dispatch job details: task lists, material lists, and plan/photo attachments

1. Why
- Dispatchers need to give the crew more than a name and a note: what tasks
  to do, what materials to bring, and the plans or photos for the job.

2. Modified Tables
- `dispatch_jobs`
  - `tasks` (text[], default empty) — checklist of tasks for the crew.
  - `materials` (text[], default empty) — materials to bring.
  - The old `start_time` column is kept (data safety) but the form no longer uses it.

3. New Tables
- `dispatch_job_files` — one row per uploaded plan or photo.
  - `id` (uuid, primary key)
  - `organization_id` (uuid, not null, FK organizations, on delete cascade)
  - `dispatch_job_id` (uuid, not null, FK dispatch_jobs, on delete cascade)
  - `file_name` (text) — original file name for display
  - `file_path` (text) — storage path inside the dispatch-files bucket
  - `uploaded_by` (text) — display name of who uploaded it
  - `created_at` (timestamptz, default now())
  - Index on (dispatch_job_id) for fast per-job lookups.

4. Storage
- Creates a PRIVATE bucket `dispatch-files` (plans and job photos are not public).
- Files are stored under `{organization_id}/{dispatch_job_id}/{file}` so storage
  policies can scope access by organization using the first path folder.

5. Security
- RLS enabled on `dispatch_job_files`:
  - SELECT: org admins, or crew actively assigned to the job.
  - INSERT/DELETE: org admins only.
- Storage policies on `dispatch-files` for authenticated users:
  - SELECT/INSERT/DELETE only when the user is an active member of the
    organization that owns the first path folder.

6. Notes
- Idempotent: safe to re-run.
*/

ALTER TABLE public.dispatch_jobs
  ADD COLUMN IF NOT EXISTS tasks text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS materials text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.dispatch_job_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  dispatch_job_id uuid NOT NULL REFERENCES public.dispatch_jobs(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  uploaded_by text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_job_files_job
  ON public.dispatch_job_files(dispatch_job_id);

ALTER TABLE public.dispatch_job_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_dispatch_files_admin_or_assigned" ON public.dispatch_job_files;
CREATE POLICY "select_dispatch_files_admin_or_assigned" ON public.dispatch_job_files
  FOR SELECT TO authenticated
  USING (
    is_org_admin(organization_id)
    OR EXISTS (
      SELECT 1
      FROM public.job_assignments ja
      JOIN public.team_members tm ON tm.id = ja.team_member_id
      WHERE ja.dispatch_job_id = dispatch_job_files.dispatch_job_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "insert_dispatch_files_admin" ON public.dispatch_job_files;
CREATE POLICY "insert_dispatch_files_admin" ON public.dispatch_job_files
  FOR INSERT TO authenticated
  WITH CHECK (is_org_admin(organization_id));

DROP POLICY IF EXISTS "delete_dispatch_files_admin" ON public.dispatch_job_files;
CREATE POLICY "delete_dispatch_files_admin" ON public.dispatch_job_files
  FOR DELETE TO authenticated
  USING (is_org_admin(organization_id));

-- Private bucket for plans and photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('dispatch-files', 'dispatch-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "dispatch_files_read" ON storage.objects;
CREATE POLICY "dispatch_files_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'dispatch-files'
    AND EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'active'
        AND tm.organization_id::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "dispatch_files_upload" ON storage.objects;
CREATE POLICY "dispatch_files_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dispatch-files'
    AND EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'active'
        AND tm.organization_id::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "dispatch_files_delete" ON storage.objects;
CREATE POLICY "dispatch_files_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'dispatch-files'
    AND (
      is_org_admin(((storage.foldername(name))[1])::uuid)
      OR EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.user_id = auth.uid()
          AND tm.status = 'active'
          AND tm.organization_id::text = (storage.foldername(name))[1]
      )
    )
  );
