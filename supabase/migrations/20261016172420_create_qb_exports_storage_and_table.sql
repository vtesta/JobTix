/*
# Create storage bucket and table for QuickBooks CSV exports

1. Storage
- Creates a public bucket `qb-exports` to store generated CSV files.
- Adds storage policies allowing anon + authenticated to upload, read, and delete files in this bucket.

2. New Tables
- `qb_exports`
  - `id` (uuid, primary key)
  - `file_name` (text) — the CSV file name
  - `file_path` (text) — the storage path to the file
  - `ticket_count` (int) — how many tickets were in the export
  - `ticket_ids` (text[]) — the IDs of tickets included
  - `created_at` (timestamptz)

3. Security
- RLS enabled on `qb_exports` with full CRUD for anon + authenticated (single-tenant, no auth).
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('qb-exports', 'qb-exports', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "anon_upload_qb_exports" ON storage.objects;
CREATE POLICY "anon_upload_qb_exports" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'qb-exports');

DROP POLICY IF EXISTS "anon_read_qb_exports" ON storage.objects;
CREATE POLICY "anon_read_qb_exports" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'qb-exports');

DROP POLICY IF EXISTS "anon_delete_qb_exports" ON storage.objects;
CREATE POLICY "anon_delete_qb_exports" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'qb-exports');

CREATE TABLE IF NOT EXISTS qb_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  file_path text NOT NULL,
  ticket_count int NOT NULL DEFAULT 0,
  ticket_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE qb_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_qb_exports" ON qb_exports;
CREATE POLICY "anon_select_qb_exports" ON qb_exports FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_qb_exports" ON qb_exports;
CREATE POLICY "anon_insert_qb_exports" ON qb_exports FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_qb_exports_table" ON qb_exports;
CREATE POLICY "anon_delete_qb_exports_table" ON qb_exports FOR DELETE
  TO anon, authenticated USING (true);