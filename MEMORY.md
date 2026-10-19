# Conversation Memory System

A private, server-side memory of our app-building conversations lives in the
database, completely inaccessible to the running website. This file documents
how to use it.

## Storage

- Table: `private.app_memory` (dedicated `private` schema)
- Columns: `title` (short label), `content` (detailed summary), `created_at`
- Locked down: RLS enabled with no policies, all grants revoked from the
  website's roles (anon/authenticated). Only trusted backend/database access
  can read or write it. The browser app cannot reach it.

## Trigger phrase

When the user says **"push this conversation to memory"**:

1. Write a detailed summary of the app-building conversation so far — what was
   requested, what was built, key decisions, schema/edge-function changes,
   conventions, and anything unresolved.
2. Save it with:
   ```sql
   INSERT INTO private.app_memory (title, content)
   VALUES ('YYYY-MM-DD: <short label>', '<detailed summary>');
   ```
   (Use the Supabase MCP `execute_sql` tool.)

## Reviewing memory

At the start of substantive work on the app (or when past context matters):

```sql
SELECT title, created_at, content
FROM private.app_memory
ORDER BY created_at DESC
LIMIT 5;
```

Summaries are ordered oldest-first when reconstructing history. Existing
entries cover earlier sessions; new sessions append new entries rather than
editing old ones (fixing a factual error in a past entry is fine).
