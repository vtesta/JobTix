/*
# Create employees and timeclock_entries tables

1. New Tables
- `employees`
  - `id` (uuid, primary key)
  - `name` (text, not null) — employee display name
  - `created_at` (timestamptz)
- `timeclock_entries`
  - `id` (uuid, primary key)
  - `employee_id` (uuid, foreign key to employees.id, ON DELETE CASCADE)
  - `clock_in` (timestamptz, not null) — punch in timestamp
  - `clock_out` (timestamptz, nullable) — punch out timestamp, null while actively clocked in
  - `created_at` (timestamptz)

2. Security
- RLS enabled on both tables.
- Full CRUD for anon + authenticated (single-tenant, no auth).

3. Indexes
- Index on timeclock_entries.employee_id for fast per-employee lookups.
- Index on timeclock_entries.clock_in for fast date-range queries.
*/

CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_employees" ON employees;
CREATE POLICY "anon_select_employees" ON employees FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_employees" ON employees;
CREATE POLICY "anon_insert_employees" ON employees FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_employees" ON employees;
CREATE POLICY "anon_update_employees" ON employees FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_employees" ON employees;
CREATE POLICY "anon_delete_employees" ON employees FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS timeclock_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  clock_in timestamptz NOT NULL,
  clock_out timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE timeclock_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_timeclock_entries" ON timeclock_entries;
CREATE POLICY "anon_select_timeclock_entries" ON timeclock_entries FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_timeclock_entries" ON timeclock_entries;
CREATE POLICY "anon_insert_timeclock_entries" ON timeclock_entries FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_timeclock_entries" ON timeclock_entries;
CREATE POLICY "anon_update_timeclock_entries" ON timeclock_entries FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_timeclock_entries" ON timeclock_entries;
CREATE POLICY "anon_delete_timeclock_entries" ON timeclock_entries FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_timeclock_employee ON timeclock_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_timeclock_clock_in ON timeclock_entries(clock_in);