/*
# Create a private conversation-memory store

## 1. Why
The builder wants a durable place to store detailed summaries of app-building
conversations, so future work sessions can review past decisions. The store
must be completely inaccessible to the running website (no anon or
authenticated database access), readable only through trusted backend access.

## 2. New Schema
- `private` — a dedicated schema that the web client (anon key, logged-in
  users) cannot see. The Supabase Data API only exposes `public`, and all
  grants to client roles on this schema are revoked below.

## 3. New Tables
- `private.app_memory`
  - `id` (uuid, primary key) — auto-generated.
  - `title` (text, not null) — short label, e.g. "2026-10-18: Invoicing module build".
  - `content` (text, not null) — the detailed conversation summary.
  - `created_at` (timestamptz, default now()) — when the summary was saved.

## 4. Security
- RLS enabled on `app_memory` with NO policies: even if a client role could
  reach the schema, every row-level operation is denied by default.
- `REVOKE ALL ON SCHEMA private FROM anon, authenticated` and matching table
  revocations: the website's keys cannot list, read, or write memory entries.
- Access requires the trusted backend/database-admin path only.

## 5. Notes
- Idempotent: safe to re-run.
- To review: `SELECT title, created_at FROM private.app_memory ORDER BY created_at;`
- To add: `INSERT INTO private.app_memory (title, content) VALUES (...);`
*/

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.app_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.app_memory ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON SCHEMA private FROM anon;
REVOKE ALL ON SCHEMA private FROM authenticated;
REVOKE ALL ON private.app_memory FROM anon;
REVOKE ALL ON private.app_memory FROM authenticated;
